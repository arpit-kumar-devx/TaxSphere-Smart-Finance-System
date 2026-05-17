import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '@/app/core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule]
})
export class LoginComponent {
  loginForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showPassword = signal(false);

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      this.auth.login(this.loginForm.value).subscribe({
        next: () => {
          this.isLoading.set(false);
          const u = this.auth.getCurrentUser();
          if (u?.role === 'ADMIN') {
            this.router.navigate(['/app/admin']);
          } else if (u?.role === 'CA') {
            this.router.navigate(['/app/ca']);
          } else {
            this.router.navigate(['/app/dashboard']);
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          // Log full backend response for debugging
          console.error('[Login] Backend error:', {
            status: err.status,
            statusText: err.statusText,
            body: err.error,
            url: err.url
          });

          let msg: string;
          if (err.status === 0) {
            msg = 'Network error. Please make sure the backend server is running.';
          } else if (err?.error?.message) {
            // Use the specific message from backend
            msg = err.error.message;
          } else if (err.status === 500) {
            msg = 'Server encountered an error. Please try again later.';
          } else if (err.status === 422 && err?.error?.errors) {
            // Validation errors from express-validator
            msg = err.error.errors.map((e: any) => e.msg).join('. ');
          } else {
            msg = 'Invalid email or password.';
          }
          this.errorMessage.set(msg);
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  getFieldError(fieldName: string): string | null {
    const field = this.loginForm.get(fieldName);
    if (field?.errors && field.touched) {
      if (field.errors['required']) {
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`;
      }
      if (field.errors['email']) {
        return 'Please enter a valid email address';
      }
      if (field.errors['minlength']) {
        return 'Password must be at least 6 characters long';
      }
    }
    return null;
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field?.invalid && field.touched);
  }
}

