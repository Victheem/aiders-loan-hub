# Aiders Global Loan Dashboard

A modern loan management dashboard built with React, TypeScript, Vite, and Supabase.

## Features

- User authentication and role-based access
- Loan officer management
- Loan tracking and repayments
- Financial reports and analytics
- PDF export functionality
- Responsive design with Tailwind CSS

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: Radix UI, Tailwind CSS, Lucide Icons
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **Charts**: Recharts
- **Deployment**: Vercel

## Local Development

### Prerequisites

- Node.js 22+ (LTS)
- npm or bun

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   # or
   bun install
   ```
3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
4. Fill in your Supabase credentials in `.env`
5. Start development server:
   ```bash
   npm run dev
   # or
   bun run dev
   ```

### Environment Variables

Create a `.env` file with:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

## Deployment to Vercel

### Prerequisites

- Vercel account
- Supabase project set up

### Steps

1. **Connect Repository**
   - Import your GitHub repository to Vercel
   - Vercel will automatically detect it as a Vite project

2. **Environment Variables**
   - In Vercel dashboard, go to Project Settings > Environment Variables
   - Add the same variables as in your `.env`:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_PUBLISHABLE_KEY`

3. **Build Settings**
   - Build Command: `npm run build` (automatic)
   - Output Directory: `dist` (automatic)
   - Node Version: 22.x (set via `.nvmrc`)

4. **Deploy**
   - Push to main branch or deploy manually
   - Vercel will build and deploy automatically

### Troubleshooting

- **Build fails**: Ensure all dependencies are in `package.json`
- **Environment variables**: Double-check they match your `.env`
- **Large bundle**: PDF libraries are lazy-loaded to reduce initial bundle size
- **CORS issues**: Ensure Supabase CORS settings allow your Vercel domain

## Database Schema

The app uses Supabase with the following main tables:
- `profiles` - User profiles
- `user_roles` - User roles (super_admin, loan_officer, staff)
- `loan_officers` - Loan officer details
- `loans` - Loan records
- `transactions` - Payment transactions
- `expenses` - Business expenses

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
