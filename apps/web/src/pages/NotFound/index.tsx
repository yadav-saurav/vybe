import { Link } from 'react-router-dom';
export function NotFound() {
  return <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
    <div><h1 className="t-title-1">This page isn’t available.</h1><p className="t-2" style={{ marginTop: 8 }}>The link may be broken or the page removed.</p><Link to="/home" style={{ color: 'var(--key)', display: 'inline-block', marginTop: 16 }}>Go Home</Link></div>
  </div>;
}
export default NotFound;
