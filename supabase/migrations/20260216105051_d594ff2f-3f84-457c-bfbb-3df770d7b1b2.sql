
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'loan_officer', 'staff');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Loan officers table
CREATE TABLE public.loan_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  bvn TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  officer_id UUID NOT NULL REFERENCES public.loan_officers(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loans table
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL,
  interest NUMERIC NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','repaid','overdue')),
  disbursement_date DATE,
  outstanding_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('disbursement','repayment')),
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================
-- SECURITY DEFINER HELPER FUNCTIONS
-- =====================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get the loan_officer record id for a given auth user
CREATE OR REPLACE FUNCTION public.get_officer_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.loan_officers WHERE user_id = _user_id LIMIT 1
$$;

-- Check if user is the loan officer for a given client
CREATE OR REPLACE FUNCTION public.is_officer_for_client(_client_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.loan_officers lo ON lo.id = c.officer_id
    WHERE c.id = _client_id AND lo.user_id = _user_id
  )
$$;

-- Check if user is the loan officer for a given loan
CREATE OR REPLACE FUNCTION public.is_officer_for_loan(_loan_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.clients c ON c.id = l.client_id
    JOIN public.loan_officers lo ON lo.id = c.officer_id
    WHERE l.id = _loan_id AND lo.user_id = _user_id
  )
$$;

-- Check if user is the loan officer for a given transaction
CREATE OR REPLACE FUNCTION public.is_officer_for_transaction(_txn_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transactions t
    JOIN public.loans l ON l.id = t.loan_id
    JOIN public.clients c ON c.id = l.client_id
    JOIN public.loan_officers lo ON lo.id = c.officer_id
    WHERE t.id = _txn_id AND lo.user_id = _user_id
  )
$$;

-- =====================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================
-- ENABLE RLS
-- =====================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- USER_ROLES
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- LOAN_OFFICERS
CREATE POLICY "Admins can manage officers" ON public.loan_officers FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Officers can view own record" ON public.loan_officers FOR SELECT USING (user_id = auth.uid());

-- CLIENTS: admin sees all, officer sees own
CREATE POLICY "Admins can manage all clients" ON public.clients FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Officers can view own clients" ON public.clients FOR SELECT USING (officer_id = public.get_officer_id(auth.uid()));
CREATE POLICY "Officers can insert clients" ON public.clients FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'loan_officer') AND officer_id = public.get_officer_id(auth.uid())
);
CREATE POLICY "Officers can update own clients" ON public.clients FOR UPDATE USING (officer_id = public.get_officer_id(auth.uid()));
CREATE POLICY "Officers can delete own clients" ON public.clients FOR DELETE USING (officer_id = public.get_officer_id(auth.uid()));

-- LOANS: admin sees all, officer sees loans for their clients
CREATE POLICY "Admins can manage all loans" ON public.loans FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Officers can view own loans" ON public.loans FOR SELECT USING (public.is_officer_for_loan(id, auth.uid()));
CREATE POLICY "Officers can insert loans" ON public.loans FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'loan_officer') AND public.is_officer_for_client(client_id, auth.uid())
);
CREATE POLICY "Officers can update own loans" ON public.loans FOR UPDATE USING (public.is_officer_for_loan(id, auth.uid()));

-- TRANSACTIONS: admin sees all, officer sees own
CREATE POLICY "Admins can manage all transactions" ON public.transactions FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Officers can view own transactions" ON public.transactions FOR SELECT USING (public.is_officer_for_transaction(id, auth.uid()));
CREATE POLICY "Officers can insert transactions" ON public.transactions FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'loan_officer') AND public.is_officer_for_loan(loan_id, auth.uid())
);

-- AUDIT_LOGS: admin sees all, others see own
CREATE POLICY "Admins can manage audit logs" ON public.audit_logs FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can view own audit logs" ON public.audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
