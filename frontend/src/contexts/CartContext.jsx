import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';

const CartContext = createContext(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function CartProvider({ children }) {
  const [searchParams] = useSearchParams();
  const [cart, setCart] = useState({ items: [], total_ht: 0, total_ttc: 0, total_items: 0 });
  const [loading, setLoading] = useState(false);

  // Session ID persistence
  const getSessionId = () => sessionStorage.getItem('vc_cart_session');
  const setSessionId = (id) => sessionStorage.setItem('vc_cart_session', id);

  // Referral code from URL
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      sessionStorage.setItem('vc_referral_code', ref);
    }
  }, [searchParams]);

  const getReferralCode = () => sessionStorage.getItem('vc_referral_code');

  // Load cart on mount
  useEffect(() => {
    const sid = getSessionId();
    if (sid) {
      api.get(`/public/cart/${sid}`)
        .then((res) => setCart(res.data))
        .catch(() => {});
    }
  }, []);

  const updateCart = useCallback(async (items) => {
    setLoading(true);
    try {
      const sid = getSessionId();
      const res = await api.post('/public/cart', {
        session_id: sid || undefined,
        items,
      });
      setSessionId(res.data.session_id);
      setCart(res.data);
      return res.data;
    } finally {
      setLoading(false);
    }
  }, []);

  const addToCart = useCallback(async (productId, qty = 1) => {
    const existing = cart.items.find((i) => i.product_id === productId);
    const newItems = existing
      ? cart.items.map((i) => i.product_id === productId ? { ...i, qty: i.qty + qty } : i)
      : [...cart.items, { product_id: productId, qty }];
    return updateCart(newItems.map((i) => ({ product_id: i.product_id, qty: i.qty })));
  }, [cart.items, updateCart]);

  const removeFromCart = useCallback(async (productId) => {
    const newItems = cart.items.filter((i) => i.product_id !== productId);
    return updateCart(newItems.map((i) => ({ product_id: i.product_id, qty: i.qty })));
  }, [cart.items, updateCart]);

  const updateQty = useCallback(async (productId, qty) => {
    if (qty <= 0) return removeFromCart(productId);
    const newItems = cart.items.map((i) =>
      i.product_id === productId ? { ...i, qty } : i
    );
    return updateCart(newItems.map((i) => ({ product_id: i.product_id, qty: i.qty })));
  }, [cart.items, updateCart, removeFromCart]);

  const clearCart = useCallback(async () => {
    return updateCart([]);
  }, [updateCart]);

  return (
    <CartContext.Provider value={{
      cart,
      loading,
      addToCart,
      removeFromCart,
      updateQty,
      clearCart,
      getSessionId,
      getReferralCode,
    }}>
      {children}
    </CartContext.Provider>
  );
}
