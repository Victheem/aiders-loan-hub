-- Migration: Add overdue logic and fix transaction triggers
-- Date: 2026-03-28

-- Step 1: Ensure repayment_schedules table exists with proper columns
CREATE TABLE IF NOT EXISTS repayment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE NOT NULL,
  due_date DATE NOT NULL,
  expected_amount NUMERIC NOT NULL,
  actual_amount NUMERIC,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'missed', 'late')),
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_loan_id ON repayment_schedules(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_due_date ON repayment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_status ON repayment_schedules(status);

-- Step 3: Create function to generate repayment schedule (weekdays only)
CREATE OR REPLACE FUNCTION generate_repayment_schedule(
  _loan_id UUID,
  _start_date DATE,
  _duration_days INTEGER,
  _total_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _business_days INTEGER;
  _daily_amount NUMERIC;
  _current_date DATE;
  _day_of_week INTEGER;
  _inserted_count INTEGER := 0;
BEGIN
  -- Calculate number of weekdays (Mon-Fri)
  _business_days := 0;
  _current_date := _start_date;
  
  WHILE _inserted_count < _duration_days LOOP
    _day_of_week := EXTRACT(DOW FROM _current_date)::INTEGER;
    -- 0 = Sunday, 6 = Saturday, so skip weekends
    IF _day_of_week NOT IN (0, 6) THEN
      _business_days := _business_days + 1;
    END IF;
    _current_date := _current_date + INTERVAL '1 day';
    _inserted_count := _inserted_count + 1;
  END LOOP;
  
  -- Calculate daily amount
  _daily_amount := _total_amount / NULLIF(_business_days, 0);
  
  -- Insert schedule entries (only weekdays)
  _inserted_count := 0;
  _current_date := _start_date;
  
  WHILE _inserted_count < _duration_days LOOP
    _day_of_week := EXTRACT(DOW FROM _current_date)::INTEGER;
    
    IF _day_of_week NOT IN (0, 6) THEN
      INSERT INTO repayment_schedules (loan_id, due_date, expected_amount, status)
      VALUES (_loan_id, _current_date, _daily_amount, 'pending');
    END IF;
    
    _current_date := _current_date + INTERVAL '1 day';
    _inserted_count := _inserted_count + 1;
  END LOOP;
END;
$$;

-- Step 4: Create function to mark overdue schedules
CREATE OR REPLACE FUNCTION mark_overdue_schedules()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update schedules that are past due and still pending
  UPDATE repayment_schedules
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
  
  -- Update loan statuses to overdue if any schedule is overdue
  UPDATE loans
  SET status = 'overdue'
  WHERE id IN (
    SELECT DISTINCT loan_id 
    FROM repayment_schedules 
    WHERE status = 'overdue'
  )
  AND status NOT IN ('repaid', 'paid');
END;
$$;

-- Step 5: Create trigger to auto-generate schedule on loan creation
CREATE OR REPLACE FUNCTION trigger_on_loan_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only generate schedule for approved/active loans
  IF NEW.status IN ('approved', 'active') THEN
    PERFORM generate_repayment_schedule(
      NEW.id,
      COALESCE(NEW.start_date, CURRENT_DATE)::DATE,
      NEW.duration,
      COALESCE(NEW.outstanding_balance, NEW.amount + (NEW.amount * NEW.interest / 100))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loan_created_schedule_trigger ON loans;
CREATE TRIGGER loan_created_schedule_trigger
AFTER INSERT ON loans
FOR EACH ROW
EXECUTE FUNCTION trigger_on_loan_created();

-- Step 6: Create function to create transaction on loan disbursement
CREATE OR REPLACE FUNCTION create_disbursement_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When loan status changes to approved/active, create disbursement transaction
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    INSERT INTO transactions (loan_id, type, amount, date)
    VALUES (NEW.id, 'disbursement', NEW.disbursed_amount, COALESCE(NEW.disbursement_date, CURRENT_DATE));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loan_disbursement_trigger ON loans;
CREATE TRIGGER loan_disbursement_trigger
AFTER INSERT ON loans
FOR EACH ROW
EXECUTE FUNCTION create_disbursement_transaction();

-- Step 7: Create function to update repayment schedule on payment
CREATE OR REPLACE FUNCTION update_schedule_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.type = 'repayment' THEN
    -- Find the earliest pending or overdue schedule
    UPDATE repayment_schedules
    SET status = 'paid',
        actual_amount = NEW.amount,
        paid_date = NEW.date
    WHERE id = (
      SELECT id FROM repayment_schedules
      WHERE loan_id = NEW.loan_id
        AND status IN ('pending', 'overdue')
      ORDER BY due_date ASC
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transaction_payment_trigger ON transactions;
CREATE TRIGGER transaction_payment_trigger
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_schedule_on_payment();

-- Step 8: Add RLS policies for repayment_schedules
ALTER TABLE repayment_schedules ENABLE ROW LEVEL SECURITY;

-- Admins can view all
CREATE POLICY "Admins can view all schedules" ON repayment_schedules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ));

-- Officers can view their own
CREATE POLICY "Officers can view own schedules" ON repayment_schedules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM loans l
    JOIN loan_officers lo ON lo.id = l.officer_id
    WHERE l.id = loan_id AND lo.user_id = auth.uid()
  ));

-- Step 9: Add helper function to get overdue data for dashboard
CREATE OR REPLACE FUNCTION get_overdue_data()
RETURNS TABLE (
  loan_id UUID,
  officer_name VARCHAR,
  overdue_amount NUMERIC,
  days_overdue INTEGER,
  next_due_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT 
  l.id as loan_id,
  lo.name as officer_name,
  l.outstanding_balance as overdue_amount,
  CURRENT_DATE - MIN(rs.due_date) as days_overdue,
  MIN(rs.due_date) as next_due_date
FROM loans l
JOIN loan_officers lo ON lo.id = l.officer_id
JOIN repayment_schedules rs ON rs.loan_id = l.id
WHERE rs.status = 'overdue'
GROUP BY l.id, lo.name, l.outstanding_balance
ORDER BY days_overdue DESC;
$$;

-- Step 10: Add optional calendar integration table
CREATE TABLE IF NOT EXISTS calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  event_id VARCHAR(255),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_loan_id ON calendar_sync_log(loan_id);