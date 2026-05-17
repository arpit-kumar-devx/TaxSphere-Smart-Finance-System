import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService, RegisterRequest } from '@/app/core/services/auth.service';
import { ToastService } from '@/app/core/services/toast.service';
import { environment } from '@/environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  registerForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  serverFieldErrors = signal<Record<string, string>>({});
  showPassword = signal(false);
  showConfirmPassword = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toasts: ToastService
  ) {
    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      country: ['', [Validators.required]],
      incomeBracket: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');

    if (!password || !confirmPassword) return null;

    if (!password.value || !confirmPassword.value) return null;

    if (password.value !== confirmPassword.value) {
      const errors = confirmPassword.errors || {};
      confirmPassword.setErrors({ ...errors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirmPassword.errors?.['passwordMismatch']) {
      const { passwordMismatch, ...rest } = confirmPassword.errors;
      confirmPassword.setErrors(Object.keys(rest).length ? rest : null);
    }

    return null;
  }

  onSubmit(): void {
    if (!this.registerForm.valid) {
      this.markFormGroupTouched();
      return;
    }

    const { password, confirmPassword } = this.registerForm.value;
    if (password !== confirmPassword) {
      this.registerForm.get('confirmPassword')?.setErrors({ passwordMismatch: true });
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.serverFieldErrors.set({});

    const registerData: RegisterRequest = {
      name: this.registerForm.value.name,
      email: this.registerForm.value.email,
      password: this.registerForm.value.password,
      confirmPassword: this.registerForm.value.confirmPassword,
      country: this.registerForm.value.country,
      incomeBracket: this.registerForm.value.incomeBracket,
    };

    if (!environment.production) {
      console.log('[register] payload:', registerData);
    }

    this.authService.register(registerData).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.toasts.success('Account created successfully');
        this.router.navigate(['/auth/login']);
      },
      error: (error: any) => {
        this.isLoading.set(false);
        const apiErrors = Array.isArray(error?.error?.errors) ? error.error.errors : [];
        const mappedErrors: Record<string, string> = {};

        apiErrors.forEach((e: any) => {
          if (!e?.path || !e?.msg) return;
          const key = e.path === 'income_bracket' ? 'incomeBracket' : e.path;
          mappedErrors[key] = e.msg;
        });
        this.serverFieldErrors.set(mappedErrors);

        this.errorMessage.set(error?.error?.message || 'Registration failed. Please try again.');
      }
    });
  }

  togglePasswordVisibility(): void { this.showPassword.set(!this.showPassword()); }
  toggleConfirmPasswordVisibility(): void { this.showConfirmPassword.set(!this.showConfirmPassword()); }

  private markFormGroupTouched(): void {
    Object.keys(this.registerForm.controls).forEach(key => this.registerForm.get(key)?.markAsTouched());
  }

  private fieldLabel(fieldName: string): string {
    const labels: Record<string, string> = {
      name: 'Full Name',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      country: 'Country',
      incomeBracket: 'Income Bracket',
    };
    return labels[fieldName] || fieldName;
  }

  getFieldError(fieldName: string): string | null {
    const field = this.registerForm.get(fieldName);
    if (field?.errors && field.touched) {
      if (field.errors['required']) return `${this.fieldLabel(fieldName)} is required`;
      if (field.errors['email']) return 'Please enter a valid email address';
      if (field.errors['minlength']) {
        return fieldName === 'password'
          ? 'Password must be at least 6 characters long'
          : `${this.fieldLabel(fieldName)} must be at least 2 characters long`;
      }
      if (field.errors['passwordMismatch']) return 'Passwords do not match';
    }

    const serverError = this.serverFieldErrors()[fieldName];
    if (serverError) return serverError;

    return null;
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!((field?.invalid && field.touched) || this.serverFieldErrors()[fieldName]);
  }
}
