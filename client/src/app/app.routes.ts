import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { UserLayoutComponent } from './layouts/user-layout/user-layout.component';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing.component').then(m => m.LandingComponent),
  },
  { path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },
  { path: 'register', redirectTo: 'auth/register', pathMatch: 'full' },

  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/components/login/login.component').then(m => m.LoginComponent)
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/components/register/register.component').then(m => m.RegisterComponent)
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/components/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/components/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
      }
    ]
  },

  {
    path: 'app/admin',
    loadComponent: () =>
      import('./features/admin/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    canActivate: [authGuard, roleGuard('ADMIN')],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/admin/components/dashboard-home/dashboard-home.component').then(m => m.AdminDashboardHomeComponent)
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/admin/components/analytics/admin-analytics.component').then(m => m.AdminAnalyticsComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./features/admin/components/users/users.component').then(m => m.AdminUsersComponent)
      },
      {
        path: 'itrs',
        loadComponent: () => import('./features/admin/components/itr-registry/itr-registry.component').then(m => m.AdminItrRegistryComponent)
      },
      {
        path: 'audit-logs',
        loadComponent: () => import('./features/admin/components/audit-logs/audit-logs.component').then(m => m.AdminAuditLogsComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/admin/components/settings/settings.component').then(m => m.AdminSettingsComponent)
      }
    ]
  },
  {
    path: 'app/ca',
    loadComponent: () =>
      import('./features/ca/ca-layout/ca-layout.component').then(m => m.CaLayoutComponent),
    canActivate: [authGuard, roleGuard('CA')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/ca/ca-dashboard/ca-dashboard.component').then(m => m.CaDashboardComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/ca/components/ca-analytics/ca-analytics.component').then(m => m.CaAnalyticsComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/ca/components/ca-profile/ca-profile.component').then(m => m.CaProfileComponent),
      },
      {
        path: 'assigned-clients',
        loadComponent: () =>
          import('./features/ca/components/ca-placeholder/ca-placeholder.component').then(m => m.CaPlaceholderComponent),
        data: { title: 'Assigned Clients', text: 'Taxpayer case file directory for assigned clients.' },
      },
      {
        path: 'document-verification',
        loadComponent: () =>
          import('./features/ca/components/ca-placeholder/ca-placeholder.component').then(m => m.CaPlaceholderComponent),
        data: { title: 'Document Verification', text: 'PAN, Aadhaar, Form 16, bank statement and proof verification queue.' },
      },
      {
        path: 'review-history',
        loadComponent: () =>
          import('./features/ca/components/ca-placeholder/ca-placeholder.component').then(m => m.CaPlaceholderComponent),
        data: { title: 'Review History', text: 'Chronological audit and compliance decisions by this CA.' },
      },
      {
        path: 'earnings',
        loadComponent: () =>
          import('./features/ca/components/ca-placeholder/ca-placeholder.component').then(m => m.CaPlaceholderComponent),
        data: { title: 'Earnings / Commission', text: 'Commission payout and completed filing performance snapshot.' },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/ca/components/ca-placeholder/ca-placeholder.component').then(m => m.CaPlaceholderComponent),
        data: { title: 'CA Settings', text: 'Professional preferences, availability and notification controls.' },
      },
    ]
  },
  {
    path: 'app',
    component: UserLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/component/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [roleGuard('USER')]
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/transactions/component/transactions.component').then(m => m.TransactionsComponent)
      },
      {
        path: 'budget',
        loadComponent: () =>
          import('./features/budgets/component/budgets.component').then(m => m.BudgetsComponent)
      },
      {
        path: 'itr',
        loadComponent: () =>
          import('./features/itr/itr-hub/itr-hub.component').then(m => m.ItrHubComponent),
        canActivate: [roleGuard('USER')]
      },
      {
        path: 'itr/:id',
        loadComponent: () =>
          import('./features/itr/itr-wizard/itr-wizard.component').then(m => m.ItrWizardComponent),
        canActivate: [roleGuard('USER')]
      },
      {
        path: 'payment/:id',
        loadComponent: () =>
          import('./features/payment/itr-pay/itr-pay.component').then(m => m.ItrPayComponent),
        canActivate: [roleGuard('USER')]
      },
      {
        path: 'tax-estimator',
        loadComponent: () =>
          import('./features/tax/components/tax-estimator/tax-estimator.component').then(m => m.TaxEstimatorComponent)
      },
      {
        path: 'tax-calendar',
        loadComponent: () =>
          import('./features/tax/components/tax-calender/tax-calendar.component').then(m => m.TaxCalendarComponent)
      },
      {
        path: 'financial-reports',
        loadComponent: () =>
          import('./features/financialReport/component/financialReport').then(m => m.FinancialReportsComponent)
      },
      {
        path: 'export',
        loadComponent: () =>
          import('./features/export/component/export.component').then(m => m.ExportComponent)
      },
      {
        path: 'settings/profile',
        loadComponent: () =>
          import('./features/settings/profile/component/profile').then(m => m.SettingsProfileComponent)
      },
      {
        path: 'profile',
        redirectTo: 'settings/profile',
        pathMatch: 'full',
      },
      {
        path: 'settings/categories',
        loadComponent: () =>
          import('./features/settings/categories/component/categories').then(m => m.SettingsCategoriesComponent)
      }
    ]
  },


  // compatibility & new stance
  { path: 'dashboard', redirectTo: 'app/dashboard', pathMatch: 'full' },
  { path: 'admin', redirectTo: 'app/admin', pathMatch: 'full' },
  { path: 'ca', redirectTo: 'app/ca', pathMatch: 'full' },
  { path: 'transactions', redirectTo: 'app/transactions', pathMatch: 'full' },
  { path: 'budget', redirectTo: 'app/budget', pathMatch: 'full' },
  { path: 'itr', redirectTo: 'app/itr', pathMatch: 'full' },
  { path: 'itr/:id', redirectTo: 'app/itr/:id', pathMatch: 'full' },
  { path: 'payment/:id', redirectTo: 'app/payment/:id', pathMatch: 'full' },
  { path: 'tax-calendar', redirectTo: 'app/tax-calendar', pathMatch: 'full' },
  { path: 'reports', redirectTo: 'app/financial-reports', pathMatch: 'full' },

  // Fallback
  { path: '**', redirectTo: 'auth/login' }
];
