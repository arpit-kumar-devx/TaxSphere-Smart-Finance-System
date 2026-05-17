import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="landing-shell">
      <header class="topbar">
        <img src="assets/images/taxsphere-logo.svg" alt="TaxSphere logo" class="brand-logo" />
        <div class="top-actions">
          <a routerLink="/auth/login" class="ghost-btn">Sign In</a>
          <a routerLink="/auth/register" class="solid-btn">Get Started</a>
        </div>
      </header>

      <section class="hero">
        <div class="hero-copy">
          <p class="tag">Premium Tax & Finance Platform</p>
          <h1>TaxSphere - Smart Finance & Tax Intelligence</h1>
          <p>
            Streamline personal finance, automate tax estimation, simplify ITR workflows, and
            make decisions with real-time analytics built for modern professionals.
          </p>
          <div class="hero-cta">
            <a routerLink="/auth/register" class="solid-btn">Get Started</a>
            <a routerLink="/auth/login" class="ghost-btn">Explore Dashboard</a>
          </div>
        </div>
      </section>

      <section class="features">
        <article class="card">Expense Tracking</article>
        <article class="card">Budget Intelligence</article>
        <article class="card">Tax Estimation</article>
        <article class="card">ITR Filing</article>
        <article class="card">Real-time Analytics</article>
      </section>

      <footer class="footer">
        <img src="assets/images/taxsphere-icon.svg" alt="TaxSphere icon" />
        <span>TaxSphere. Premium SaaS for confident financial compliance.</span>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; font-family: Inter, sans-serif; }
    .landing-shell { min-height: 100vh; color: #e2e8f0; background: radial-gradient(circle at 18% 18%, #312e81 0%, #111827 45%, #020617 100%); padding: 1.2rem 1.2rem 2rem; }
    .topbar { max-width: 1120px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .brand-logo { height: 42px; width: auto; }
    .top-actions, .hero-cta { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .solid-btn, .ghost-btn { border-radius: 999px; padding: 0.72rem 1.2rem; text-decoration: none; font-weight: 600; transition: transform 0.2s ease; }
    .solid-btn { background: linear-gradient(135deg, #4f46e5, #7c3aed, #0ea5e9); color: #fff; box-shadow: 0 10px 30px rgba(79, 70, 229, 0.3); }
    .ghost-btn { border: 1px solid rgba(148, 163, 184, 0.5); color: #cbd5e1; background: rgba(15, 23, 42, 0.45); }
    .solid-btn:hover, .ghost-btn:hover { transform: translateY(-2px); }
    .hero { max-width: 1120px; margin: 3.5rem auto 2rem; padding: 3rem; background: linear-gradient(135deg, rgba(79, 70, 229, 0.26), rgba(6, 182, 212, 0.16)); border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 28px; box-shadow: 0 24px 60px rgba(2, 6, 23, 0.45); }
    .tag { color: #7dd3fc; font-weight: 600; letter-spacing: 0.04em; margin: 0 0 0.8rem; }
    h1 { margin: 0; font-size: clamp(1.9rem, 5vw, 3rem); line-height: 1.15; color: #f8fafc; max-width: 760px; }
    .hero p { font-size: 1.04rem; max-width: 700px; color: #cbd5e1; }
    .features { max-width: 1120px; margin: 1.5rem auto 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
    .card { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 18px; padding: 1.15rem; font-weight: 600; color: #e2e8f0; box-shadow: 0 8px 24px rgba(2, 6, 23, 0.28); }
    .footer { max-width: 1120px; margin: 2rem auto 0; display: flex; align-items: center; gap: 0.7rem; color: #94a3b8; font-size: 0.92rem; }
    .footer img { width: 28px; height: 28px; }
    @media (max-width: 700px) {
      .hero { padding: 1.45rem; border-radius: 20px; margin-top: 2rem; }
      .topbar { align-items: flex-start; flex-direction: column; }
    }
  `],
})
export class LandingComponent {}
