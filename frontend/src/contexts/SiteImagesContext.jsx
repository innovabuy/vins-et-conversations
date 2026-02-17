import { createContext, useContext, useState, useEffect } from 'react';
import { siteImagesAPI } from '../services/api';

const SiteImagesContext = createContext(null);

export function SiteImagesProvider({ children }) {
  const [images, setImages] = useState({});

  useEffect(() => {
    siteImagesAPI.publicList()
      .then((res) => {
        const map = {};
        const list = res.data || [];
        for (const img of list) {
          map[img.slot] = img;
        }
        setImages(map);
      })
      .catch(() => {});
  }, []);

  return (
    <SiteImagesContext.Provider value={images}>
      {children}
    </SiteImagesContext.Provider>
  );
}

export function useSiteImage(slot) {
  const ctx = useContext(SiteImagesContext);
  if (!ctx) return null;
  return ctx[slot] || null;
}
