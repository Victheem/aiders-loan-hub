
-- Add phone, latitude, longitude to loan_officers
ALTER TABLE public.loan_officers 
  ADD COLUMN IF NOT EXISTS phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Add daily_repayment_amount and total_with_interest to loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS daily_repayment_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_with_interest numeric DEFAULT 0;

-- Create repayment_schedules table
CREATE TABLE IF NOT EXISTS public.repayment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid REFERENCES public.loans(id) ON DELETE CASCADE NOT NULL,
  due_date date NOT NULL,
  expected_amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.repayment_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies for repayment_schedules
CREATE POLICY "Admins can manage all schedules"
  ON public.repayment_schedules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Officers can view own schedules"
  ON public.repayment_schedules FOR SELECT
  TO authenticated
  USING (public.is_officer_for_loan(loan_id, auth.uid()));

CREATE POLICY "Officers can update own schedules"
  ON public.repayment_schedules FOR UPDATE
  TO authenticated
  USING (public.is_officer_for_loan(loan_id, auth.uid()));

-- Staff can view all for read-only access
CREATE POLICY "Staff can view schedules"
  ON public.repayment_schedules FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'staff'));

-- Function to generate repayment schedule (excluding weekends)
CREATE OR REPLACE FUNCTION public.generate_repayment_schedule(
  _loan_id uuid,
  _total_amount numeric,
  _start_date date,
  _duration_days integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _daily_amount numeric;
  _current_date date;
  _days_added integer := 0;
BEGIN
  -- Delete existing schedule for this loan
  DELETE FROM public.repayment_schedules WHERE loan_id = _loan_id;
  
  _daily_amount := ROUND(_total_amount / _duration_days, 2);
  _current_date := _start_date + 1; -- Start day after disbursement
  
  WHILE _days_added < _duration_days LOOP
    -- Skip weekends (0=Sunday, 6=Saturday)
    IF EXTRACT(DOW FROM _current_date) NOT IN (0, 6) THEN
      INSERT INTO public.repayment_schedules (loan_id, due_date, expected_amount, status)
      VALUES (_loan_id, _current_date, _daily_amount, 'pending');
      _days_added := _days_added + 1;
    END IF;
    _current_date := _current_date + 1;
  END LOOP;
  
  -- Update loan with daily repayment amount
  UPDATE public.loans 
  SET daily_repayment_amount = _daily_amount, 
      total_with_interest = _total_amount
  WHERE id = _loan_id;
END;
$$;

-- Function to calculate risk score for an officer
CREATE OR REPLACE FUNCTION public.calculate_officer_risk_score(_officer_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH officer_loans AS (
    SELECT l.id, l.outstanding_balance, l.amount, l.status,
           (SELECT COUNT(*) FROM repayment_schedules rs 
            WHERE rs.loan_id = l.id AND rs.status = 'missed') as missed_payments,
           (SELECT COUNT(*) FROM repayment_schedules rs 
            WHERE rs.loan_id = l.id AND rs.status = 'late') as late_payments,
           (SELECT COUNT(*) FROM repayment_schedules rs 
            WHERE rs.loan_id = l.id) as total_payments
    FROM loans l
    JOIN clients c ON c.id = l.client_id
    WHERE c.officer_id = _officer_id
      AND l.status IN ('approved', 'overdue')
  )
  SELECT COALESCE(
    LEAST(100, ROUND(
      (SUM(missed_payments) * 15 + SUM(late_payments) * 5 + 
       CASE WHEN SUM(amount) > 0 THEN (SUM(outstanding_balance) / SUM(amount)) * 30 ELSE 0 END +
       COUNT(CASE WHEN status = 'overdue' THEN 1 END) * 20
      )
    )), 0)
  FROM officer_loans
$$;
