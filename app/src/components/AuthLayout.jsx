import { Droplets, Waves } from 'lucide-react'

export default function AuthLayout({ title, description, children }) {
  return <main className="auth-layout">
    <section className="auth-hero" aria-hidden="true">
      <div className="auth-hero-grid" />
      <div className="auth-orbit orbit-outer" />
      <div className="auth-orbit orbit-inner" />
      <div className="auth-tank"><div className="auth-water" /><div className="auth-ticks" /></div>
      <div className="auth-hero-title"><Waves size={21} /> <span>ติดตามระดับน้ำจาก ThingsBoard</span></div>
    </section>
    <section className="auth-sheet" aria-labelledby="auth-title">
      <div className="auth-form-wrap">
        <div className="auth-brand"><span className="brand-icon"><Droplets size={24} /></span><span>WaterGuard <b>Pro</b></span></div>
        <h1 id="auth-title">{title}</h1>
        <p>{description}</p>
        {children}
      </div>
    </section>
  </main>
}
