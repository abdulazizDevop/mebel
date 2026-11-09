import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { dtoToProduct, getProduct as apiGetProduct } from '../api';
import { productPath } from '../utils/paths';

/* /product/:id — the pre-slug URL printed on QR codes, business cards and sent
 * in WhatsApp. Resolves the product and replaces the URL with the canonical
 * /catalog/<category>/<slug>, so old links keep working forever. (Bots get a
 * real 301 from the server-side renderer in stage 2.) */
export function LegacyProductRedirect() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { allProducts } = useStore();
  const [notFound, setNotFound] = useState(false);

  const cached = allProducts.find((p) => p.id === id && p.slug);

  useEffect(() => {
    if (!id || cached) return;
    apiGetProduct(id)
      .then((dto) => navigate(productPath(dtoToProduct(dto)), { replace: true }))
      .catch(() => setNotFound(true));
  }, [id, cached, navigate]);

  if (cached) return <Navigate to={productPath(cached)} replace />;

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h2 className="text-3xl font-bold mb-4">Товар не найден</h2>
        <button onClick={() => navigate('/catalog')} className="bg-primary text-primary-inv pill px-8 py-3 font-bold">
          Вернуться в каталог
        </button>
      </div>
    );
  }
  return <div className="min-h-[40vh]" aria-busy="true" />;
}
