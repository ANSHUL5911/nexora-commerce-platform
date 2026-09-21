import { Link } from 'react-router';
import './Footer.css';

export function Footer() {
  return (
    <footer className="nx-footer" aria-label="Site Footer">
      <div className="nx-footer-container">
        <div className="nx-footer-grid">
          {/* Brand & Manifesto Column */}
          <div className="nx-footer-brand-col">
            <Link to="/" className="nx-footer-brand" aria-label="Nexora Home">
              NEXORA
            </Link>
            <p className="nx-footer-tagline">
              Architectural essentials, engineered for enduring utility. Formulated through reduction, crafted for permanence.
            </p>
            <div className="nx-footer-status">
              <span className="nx-status-dot" aria-hidden="true" />
              <span className="nx-status-label">EDITION 01 ACTIVE — MATERIAL GRADE A</span>
            </div>
          </div>

          {/* Navigation Column */}
          <div className="nx-footer-nav-col">
            <h4 className="nx-footer-heading">Collection</h4>
            <ul className="nx-footer-list">
              <li><Link to="/catalog?category=APPAREL" className="nx-footer-link">01 Apparel</Link></li>
              <li><Link to="/catalog?category=LIVING" className="nx-footer-link">02 Living</Link></li>
              <li><Link to="/catalog?category=FOOTWEAR" className="nx-footer-link">03 Footwear</Link></li>
              <li><Link to="/catalog?category=ACCESSORIES" className="nx-footer-link">04 Accessories</Link></li>
            </ul>
          </div>

          {/* Architecture Column */}
          <div className="nx-footer-nav-col">
            <h4 className="nx-footer-heading">Storefront</h4>
            <ul className="nx-footer-list">
              <li><Link to="/" className="nx-footer-link">Homepage</Link></li>
              <li><Link to="/catalog" className="nx-footer-link">Full Catalog</Link></li>
              <li><Link to="/orders" className="nx-footer-link">Orders &amp; Invoices</Link></li>
              <li><Link to="/cart" className="nx-footer-link">Cart Review</Link></li>
            </ul>
          </div>

          {/* Discipline Column */}
          <div className="nx-footer-nav-col">
            <h4 className="nx-footer-heading">Discipline</h4>
            <ul className="nx-footer-list">
              <li><span className="nx-footer-static">Material Standards</span></li>
              <li><span className="nx-footer-static">Proportional Integrity</span></li>
              <li><span className="nx-footer-static">Enduring Utility</span></li>
              <li><span className="nx-footer-static">Traceable Supply</span></li>
            </ul>
          </div>
        </div>

        {/* Hairline Divider & Bottom Bar */}
        <div className="nx-footer-bottom">
          <div className="nx-footer-copyright">
            © {new Date().getFullYear()} NEXORA COMMERCE PLATFORM. ALL RIGHTS RESERVED.
          </div>
          <div className="nx-footer-coords">
            LAT 28.6139° N / LON 77.2090° E — ARCHITECTURAL EDITION
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
