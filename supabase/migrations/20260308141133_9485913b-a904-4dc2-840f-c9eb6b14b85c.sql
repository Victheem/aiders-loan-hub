
-- Step 1: Drop ALL loan policies that reference client_id
DROP POLICY IF EXISTS "Officers can insert loans" ON public.loans;
DROP POLICY IF EXISTS "Officers can update own loans" ON public.loans;
DROP POLICY IF EXISTS "Officers can view own loans" ON public.loans;
DROP POLICY IF EXISTS "Admins can manage all loans" ON public.loans;

-- Step 2: Add officer_id column
ALTER TABLE public.loans ADD COLUMN officer_id uuid REFERENCES public.loan_officers(id);

-- Step 3: Migrate data from client->officer relationship
UPDATE public.loans l SET officer_id = c.officer_id FROM public.clients c WHERE c.id = l.client_id;

-- Step 4: Drop client_id
ALTER TABLE public.loans DROP COLUMN client_id;

-- Step 5: Make officer_id NOT NULL
ALTER TABLE public.loans ALTER COLUMN officer_id SET NOT NULL;

-- Step 6: Drop client RLS policies and table
DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;
DROP POLICY IF EXISTS "Officers can delete own clients" ON public.clients;
DROP POLICY IF EXISTS "Officers can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Officers can update own clients" ON public.clients;
DROP POLICY IF EXISTS "Officers can view own clients" ON public.clients;
DROP TABLE IF EXISTS public.clients;

-- Step 7: Recreate loan policies using officer_id
CREATE POLICY "Admins can manage all loans" ON public.loans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Officers can view own loans" ON public.loans FOR SELECT TO authenticated
  USING (officer_id = get_officer_id(auth.uid()));

CREATE POLICY "Officers can insert loans" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'loan_officer'::app_role) AND officer_id = get_officer_id(auth.uid()));

CREATE POLICY "Officers can update own loans" ON public.loans FOR UPDATE TO authenticated
  USING (officer_id = get_officer_id(auth.uid()));

-- Step 8: Update functions
CREATE OR REPLACE FUNCTION public.is_officer_for_loan(_loan_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.loan_officers lo ON lo.id = l.officer_id
    WHERE l.id = _loan_id AND lo.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_officer_for_transaction(_txn_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transactions t
    JOIN public.loans l ON l.id = t.loan_id
    JOIN public.loan_officers lo ON lo.id = l.officer_id
    WHERE t.id = _txn_id AND lo.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.calculate_officer_risk_score(_officer_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH officer_loans AS (
    SELECT l.id, l.outstanding_balance, l.amount, l.status,
           (SELECT COUNT(*) FROM repayment_schedules rs WHERE rs.loan_id = l.id AND rs.status = 'missed') as missed_payments,
           (SELECT COUNT(*) FROM repayment_schedules rs WHERE rs.loan_id = l.id AND rs.status = 'late') as late_payments
    FROM loans l
    WHERE l.officer_id = _officer_id AND l.status IN ('approved', 'overdue')
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

DROP FUNCTION IF EXISTS public.is_officer_for_client(uuid, uuid);
