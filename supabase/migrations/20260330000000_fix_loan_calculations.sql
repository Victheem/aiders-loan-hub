-- Migration: Fix loan calculations, working days, and overdue detection
-- Date: 2026-03-30

-- Step 1: Add missing columns to loans table
ALTER TABLE public.loans 
  ADD COLUMN IF NOT EXISTS disbursed_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Step 2: Create improved generate_repayment_schedule function (20 WORKING days)
-- This function generates repayment schedules spread across 20 WORKING days (Mon-Fri only)
CREATE OR REPLACE FUNCTION public.generate_working_days_schedule(
  _loan_id UUID,
  _disbursed_amount NUMERIC,
  _interest_rate NUMERIC,
  _working_days INTEGER DEFAULT 20,
  _start_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total_repayment NUMERIC;
  _daily_amount NUMERIC;
  _current_date DATE;
  _business_days_count INTEGER := 0;
  _calendar_days INTEGER := 0;
  _day_of_week INTEGER;
BEGIN
  -- Calculate total repayment amount (disbursed + 10% interest)
  _total_repayment := _disbursed_amount + (_disbursed_amount * _interest_rate / 100);
  
  -- Calculate daily amount across WORKING days only
  _daily_amount := ROUND(_total_repayment / _working_days, 2);
  
  -- Clear any existing schedules for this loan
  DELETE FROM public.repayment_schedules WHERE loan_id = _loan_id;
  
  -- Generate schedule: iterate until we have 20 working days
  _current_date := _start_date + 1; -- Start from next day
  _calendar_days := 0;
  
  WHILE _business_days_count < _working_days LOOP
    _day_of_week := EXTRACT(DOW FROM _current_date)::INTEGER;
    
    -- Only count weekdays (1=Monday to 5=Friday, skip 0=Sunday and 6=Saturday)
    IF _day_of_week NOT IN (0, 6) THEN
      INSERT INTO public.repayment_schedules (
        loan_id, 
        due_date, 
        expected_amount, 
        status,
        created_at
      )
      VALUES (
        _loan_id, 
        _current_date, 
        _daily_amount, 
        'pending',
        NOW()
      );
      _business_days_count := _business_days_count + 1;
    END IF;
    
    _current_date := _current_date + 1;
    _calendar_days := _calendar_days + 1;
    
    -- Safety: don't run forever
    IF _calendar_days > 60 THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Update loan record with calculated values
  UPDATE public.loans 
  SET 
    disbursed_amount = _disbursed_amount,
    interest_amount = _total_repayment - _disbursed_amount,
    total_with_interest = _total_repayment,
    daily_repayment_amount = _daily_amount,
    outstanding_balance = _total_repayment,
    start_date = _start_date,
    due_date = _current_date - 1,
    status = 'active'
  WHERE id = _loan_id;
  
  -- Create initial disbursement transaction
  INSERT INTO public.transactions (loan_id, type, amount, date, created_at)
  VALUES (_loan_id, 'disbursement', _disbursed_amount, _start_date, NOW());
END;
$$;

-- Step 3: Create automatic overdue detection function
CREATE OR REPLACE FUNCTION public.mark_schedules_overdue()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Mark all pending schedules past their due date as overdue
  UPDATE public.repayment_schedules
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
  
  -- Update loan statuses based on overdue schedules
  UPDATE public.loans
  SET status = 'overdue'
  WHERE id IN (
    SELECT DISTINCT loan_id 
    FROM public.repayment_schedules 
    WHERE status = 'overdue'
  )
  AND status NOT IN ('repaid', 'paid');
END;
$$;

-- Step 4: Create trigger to call overdue detection on any schedule change
CREATE OR REPLACE FUNCTION public.trigger_check_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check overdue when schedules are modified
  PERFORM public.mark_schedules_overdue();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_overdue_trigger ON public.repayment_schedules;
CREATE TRIGGER check_overdue_trigger
AFTER INSERT OR UPDATE ON public.repayment_schedules
FOR EACH ROW
EXECUTE FUNCTION public.trigger_check_overdue();

-- Step 5: Create function to recalculate loan balance from schedules
CREATE OR REPLACE FUNCTION public.recalculate_loan_balance(_loan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total_expected NUMERIC;
  _total_paid NUMERIC;
  _new_balance NUMERIC;
BEGIN
  -- Get totals from schedules
  SELECT 
    COALESCE(SUM(expected_amount), 0),
    COALESCE(SUM(CASE WHEN status = 'paid' THEN COALESCE(actual_amount, expected_amount) ELSE 0 END), 0)
  INTO _total_expected, _total_paid
  FROM public.repayment_schedules
  WHERE loan_id = _loan_id;
  
  _new_balance := _total_expected - _total_paid;
  
  -- Update loan balance
  UPDATE public.loans
  SET 
    outstanding_balance = GREATEST(0, _new_balance),
    status = CASE 
      WHEN _new_balance <= 0 THEN 'repaid'
      WHEN status = 'overdue' THEN 'overdue'
      ELSE 'active'
    END
  WHERE id = _loan_id;
END;
$$;

-- Step 6: Create function to handle repayment and update schedule
CREATE OR REPLACE FUNCTION public.handle_repayment(_loan_id UUID, _amount NUMERIC, _payment_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _remaining_amount NUMERIC;
  _schedule RECORD;
BEGIN
  _remaining_amount := _amount;
  
  -- Find and update pending/overdue schedules in order
  FOR _schedule IN 
    SELECT id, expected_amount, status
    FROM public.repayment_schedules
    WHERE loan_id = _loan_id
      AND status IN ('pending', 'overdue')
    ORDER BY due_date ASC
  LOOP
    IF _remaining_amount <= 0 THEN
      EXIT;
    END IF;
    
    IF _remaining_amount >= _schedule.expected_amount THEN
      -- Full payment for this schedule
      UPDATE public.repayment_schedules
      SET status = 'paid',
          actual_amount = _schedule.expected_amount,
          paid_date = _payment_date
      WHERE id = _schedule.id;
      
      _remaining_amount := _remaining_amount - _schedule.expected_amount;
    ELSE
      -- Partial payment
      UPDATE public.repayment_schedules
      SET expected_amount = expected_amount - _remaining_amount,
          actual_amount = _remaining_amount,
          paid_date = _payment_date
      WHERE id = _schedule.id;
      
      _remaining_amount := 0;
    END IF;
  END LOOP;
  
  -- Recalculate loan balance
  PERFORM public.recalculate_loan_balance(_loan_id);
  
  -- Record the transaction
  INSERT INTO public.transactions (loan_id, type, amount, date, created_at)
  VALUES (_loan_id, 'repayment', _amount, _payment_date, NOW());
END;
$$;

-- Step 7: Update the old generate_repayment_schedule to use the new function
CREATE OR REPLACE FUNCTION public.generate_repayment_schedule(
  _loan_id UUID,
  _total_amount NUMERIC,
  _start_date DATE,
  _duration_days INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _loan_record RECORD;
BEGIN
  -- Get the loan record
  SELECT * INTO _loan_record
  FROM public.loans
  WHERE id = _loan_id;
  
  -- Call the working days function
  PERFORM public.generate_working_days_schedule(
    _loan_id,
    _loan_record.disbursed_amount,
    _loan_record.interest,
    _duration_days,
    _start_date
  );
END;
$$;

-- Step 8: Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_loan_overdue 
  ON public.repayment_schedules(loan_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_loans_officer_status 
  ON public.loans(officer_id, status);

-- Step 9: Fix calculate_officer_risk_score to use officer_id directly
CREATE OR REPLACE FUNCTION public.calculate_officer_risk_score(_officer_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH officer_loans AS (
    SELECT 
      l.id, 
      l.outstanding_balance, 
      l.amount, 
      l.status,
      (SELECT COUNT(*) FROM repayment_schedules rs 
       WHERE rs.loan_id = l.id AND rs.status = 'missed') as missed_payments,
      (SELECT COUNT(*) FROM repayment_schedules rs 
       WHERE rs.loan_id = l.id AND rs.status = 'overdue') as overdue_payments
    FROM loans l
    WHERE l.officer_id = _officer_id
      AND l.status IN ('active', 'overdue')
  )
  SELECT COALESCE(
    LEAST(100, ROUND(
      (COALESCE(SUM(missed_payments), 0) * 15 + 
       COALESCE(SUM(overdue_payments), 20) + 
       CASE WHEN SUM(amount) > 0 THEN (SUM(outstanding_balance) / SUM(amount)) * 30 ELSE 0 END +
       COUNT(CASE WHEN status = 'overdue' THEN 1 END) * 20
      )
    )), 0)
  FROM officer_loans
$$;
