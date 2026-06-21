import axios from 'axios';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Header } from '../../components/Header';
import './HomePage.css';
import { ProductsGrid } from './ProductsGrid';


export function HomePage({ cart, loadCart }) {
    const [products, setProducts] = useState([]);
    const [searchParams] = useSearchParams();
    const search = searchParams.get('search');

    useEffect(() => {
        const url = search ? `/api/products?search=${search}` : '/api/products';

        const getHomeData = async () => {
            const response = await axios.get(url)
            setProducts(response.data);
        };
        getHomeData();
    }, [search]);

    return (
        <>
            <title>Ecommerce Project</title>
            <link rel="icon" href="home-favicon.png" />

            <Header cart={cart} />


            <div className="home-page">
                <ProductsGrid products={products} loadCart={loadCart} />
            </div>
        </>
    );
}
