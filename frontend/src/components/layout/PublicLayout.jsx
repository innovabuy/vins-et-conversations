import { Outlet, Link, NavLink } from 'react-router-dom';
import { Wine, Mail, Phone, Menu, X, ShoppingCart, Gift, Star, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { boutiqueAPI } from '../../services/api';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { useSiteImage } from '../../contexts/SiteImagesContext';

function useCartBadge() {
  try {
    const { useCart } = require('../../contexts/CartContext');
    const { cart } = useCart();
    return cart.total_items;
  } catch {
    return 0;
  }
}

function useReferral() {
  const [ambassador, setAmbassador] = useState(null);
  useEffect(() => {
    const code = sessionStorage.getItem('vc_referral_code');
    if (code) {
      boutiqueAPI.resolveAmbassador(code)
        .then((res) => setAmbassador(res.data))
        .catch(() => {});
    }
  }, []);
  return ambassador;
}

const SITE_URL = window.location.protocol + '//' + window.location.hostname + ':8082';

function NavDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
        {label} <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-lg border py-2 min-w-[180px] z-50">
          {items.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-wine-700">
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const cartCount = useCartBadge();
  const ambassador = useReferral();
  const { app_logo_url, app_name } = useAppSettings();
  const headerImage = useSiteImage('commun_logo_header');
  const footerImage = useSiteImage('commun_logo_footer');
  const headerLogo = headerImage?.image_url || app_logo_url;
  const footerLogo = footerImage?.image_url || app_logo_url;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/boutique" className="flex items-center gap-2">
              {headerLogo ? (
                <img src={headerLogo} alt={headerImage?.alt_text || app_name} className="h-8 w-auto object-contain" />
              ) : (
                <div className="bg-wine-700 p-1.5 rounded-lg">
                  <Wine size={20} className="text-white" />
                </div>
              )}
              <span className="text-lg font-bold text-gray-900">{app_name}</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-6">
              <NavDropdown label="Boutique" items={[
                { href: '/boutique', label: 'Nos vins' },
                { href: '/boutique/selection', label: 'Sélection du moment' },
                { href: `${SITE_URL}/coffrets.html`, label: 'Coffrets' },
              ]} />
              <NavDropdown label="Nos Prestations" items={[
                { href: `${SITE_URL}/cse.html`, label: 'Espace CSE' },
                { href: `${SITE_URL}/ecoles.html`, label: 'Partenariat Écoles' },
                { href: `${SITE_URL}/ambassadeurs.html`, label: 'Devenir Ambassadeur' },
                { href: `${SITE_URL}/repas-soirees.html`, label: 'Repas & Soirées' },
              ]} />
              <NavDropdown label="À Propos" items={[
                { href: `${SITE_URL}/apropos.html`, label: 'Notre histoire' },
                { href: `${SITE_URL}/equipe.html`, label: "L'équipe" },
                { href: `${SITE_URL}/faq.html`, label: 'FAQ' },
                { href: `${SITE_URL}/avis.html`, label: 'Avis' },
                { href: `${SITE_URL}/partenaires.html`, label: 'Nos partenaires' },
              ]} />
              <NavLink to="/boutique/contact" className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-wine-700' : 'text-gray-600 hover:text-gray-900'}`}>
                Contact
              </NavLink>
              <Link to="/boutique/panier" className="relative p-2 text-gray-600 hover:text-wine-700 transition-colors">
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-wine-700 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{cartCount}</span>
                )}
              </Link>
              <Link to="/login" className="btn-primary text-sm px-4 py-2">
                Espace membre
              </Link>
            </nav>

            {/* Mobile toggle */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2">
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <div className="md:hidden border-t bg-white px-4 py-4 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1 pb-1">Boutique</p>
            <NavLink to="/boutique" end onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Nos vins</NavLink>
            <NavLink to="/boutique/selection" onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Sélection du moment</NavLink>
            <a href={`${SITE_URL}/coffrets.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Coffrets</a>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-3 pb-1">Nos Prestations</p>
            <a href={`${SITE_URL}/cse.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Espace CSE</a>
            <a href={`${SITE_URL}/ecoles.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Partenariat Écoles</a>
            <a href={`${SITE_URL}/ambassadeurs.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Devenir Ambassadeur</a>
            <a href={`${SITE_URL}/repas-soirees.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Repas & Soirées</a>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-3 pb-1">À Propos</p>
            <a href={`${SITE_URL}/apropos.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">Notre histoire</a>
            <a href={`${SITE_URL}/equipe.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">L'équipe</a>
            <a href={`${SITE_URL}/faq.html`} onClick={() => setMenuOpen(false)} className="block py-2 pl-3 text-sm text-gray-700 hover:text-wine-700">FAQ</a>

            <div className="border-t border-gray-100 mt-3 pt-3 space-y-2">
              <NavLink to="/boutique/contact" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium text-gray-700 hover:text-wine-700">Contact</NavLink>
              <Link to="/boutique/panier" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2 text-sm font-medium text-gray-700 hover:text-wine-700">
                <ShoppingCart size={16} /> Panier {cartCount > 0 && <span className="bg-wine-700 text-white text-xs px-1.5 py-0.5 rounded-full">{cartCount}</span>}
              </Link>
              <Link to="/login" onClick={() => setMenuOpen(false)} className="block btn-primary text-sm text-center py-2">Espace membre</Link>
            </div>
          </div>
        )}
      </header>

      {/* Referral banner */}
      {ambassador && (
        <div className="bg-wine-50 border-b border-wine-100 px-4 py-2.5 text-center">
          <p className="text-sm text-wine-800 flex items-center justify-center gap-2">
            <Gift size={16} className="text-wine-600" />
            Recommandé par <span className="font-semibold">{ambassador.name}</span>
          </p>
        </div>
      )}

      {/* Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                {footerLogo ? (
                  <img src={footerLogo} alt={footerImage?.alt_text || app_name} className="h-8 w-auto object-contain bg-white rounded-md p-0.5" />
                ) : (
                  <div className="bg-wine-700 p-1.5 rounded-lg"><Wine size={18} className="text-white" /></div>
                )}
                <span className="font-bold">{app_name}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Nicolas Froment — Saint-Sylvain-d'Anjou — Maine-et-Loire (49)<br />
                Vente de vins à travers des campagnes solidaires et conviviales.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-gray-400">Navigation</h3>
              <div className="space-y-2">
                <Link to="/boutique" className="block text-sm text-gray-300 hover:text-white">Nos vins</Link>
                <Link to="/boutique/selection" className="block text-sm text-gray-300 hover:text-white">Sélection du moment</Link>
                <a href={`${SITE_URL}/coffrets.html`} className="block text-sm text-gray-300 hover:text-white">Coffrets</a>
                <a href={`${SITE_URL}/cse.html`} className="block text-sm text-gray-300 hover:text-white">Espace CSE</a>
                <a href={`${SITE_URL}/ecoles.html`} className="block text-sm text-gray-300 hover:text-white">Partenariat Écoles</a>
                <a href={`${SITE_URL}/ambassadeurs.html`} className="block text-sm text-gray-300 hover:text-white">Devenir Ambassadeur</a>
                <Link to="/boutique/contact" className="block text-sm text-gray-300 hover:text-white">Contact</Link>
                <Link to="/login" className="block text-sm text-gray-300 hover:text-white">Espace membre</Link>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-gray-400">Contact</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <a href="mailto:nicolas@vins-conversations.fr" className="flex items-center gap-2 hover:text-white">
                  <Mail size={14} /> nicolas@vins-conversations.fr
                </a>
                <div className="flex items-center gap-2">
                  <Phone size={14} /> Saint-Sylvain-d'Anjou (49)
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
            <span>&copy; {new Date().getFullYear()} {app_name}. Tous droits réservés.</span>
            <div className="flex items-center gap-4">
              <Link to="/boutique/cgv" className="hover:text-white">CGV</Link>
              <Link to="/boutique/mentions-legales" className="hover:text-white">Mentions légales</Link>
            </div>
            <span>L'abus d'alcool est dangereux pour la santé.</span>
          </div>
          <div className="border-t border-gray-800 mt-4 pt-4 text-center">
            <p className="text-[0.7rem] text-gray-600">
              Conception &amp; développement{' '}
              <a href="https://www.cap-performances.fr" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400 no-underline">cap-performances.fr</a> · {' '}
              <a href="https://www.cap-numerik.fr" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400 no-underline">cap-numerik.fr</a> · {' '}
              <a href="https://www.vendmieux.fr" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400 no-underline">vendmieux.fr</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
