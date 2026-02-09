export default function LandingPage() {
  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '32px', color: '#161b2e', marginBottom: '16px' }}>
        PRSF Loan Tracking MIS - Debug Test
      </h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        If you can see this text, the page is rendering correctly.
        The issue was in the previous page code.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <a href="/auth/login" style={{ padding: '10px 20px', background: '#1d3a6b', color: 'white', borderRadius: '8px', textDecoration: 'none' }}>
          Sign In
        </a>
        <a href="/auth/sign-up" style={{ padding: '10px 20px', background: '#eee', color: '#333', borderRadius: '8px', textDecoration: 'none' }}>
          Sign Up
        </a>
      </div>
    </div>
  )
}
