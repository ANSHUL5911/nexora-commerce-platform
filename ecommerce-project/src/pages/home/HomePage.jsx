import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Header } from '../../components/Header';
import { productsApi } from '../../api/products';
import { adaptProduct } from '../../api/adapters';
import './HomePage.css';
import { ProductsGrid } from './ProductsGrid';

export function HomePage({ cart, loadCart }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchParams] = useSearchParams();
    const search = searchParams.get('search') || undefined;

    useEffect(() => {
        let isMounted = true;
        const getHomeData = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await productsApi.listProducts({ search });
                if (isMounted) {
                    const rawList = Array.isArray(data) ? data : (data?.products || data?.data?.products || []);
                    setProducts(rawList.map(adaptProduct));
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message || 'Failed to load products');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };
        getHomeData();
        return () => { isMounted = false; };
    }, [search]);

    return (
        <>
            <title>Nexora</title>
            <link rel="icon" href="home-favicon.png" />

            <Header cart={cart} />


            <div className="home-page">
                {loading && (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#666' }}>
                        Loading products...
                    </div>
                )}
                {error && (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#c00' }}>
                        {error}
                    </div>
                )}
                <ProductsGrid products={products} loadCart={loadCart} />
            </div>
        </>
    );
}

