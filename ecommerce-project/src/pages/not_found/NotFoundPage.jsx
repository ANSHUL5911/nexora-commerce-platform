import { Header } from '../../components/Header';
import './NotFoundPage.css';

export function NotFoundPage({ cart }) {
    return (
        <>
            <title>Page Not Found</title>
            <link rel="icon" href="home-favicon.png" />
            <Header cart={cart} />
            <div className="not-found-page">
                <div className="not-found-content">
                    <div className="not-found-title">404</div>
                    <div className="not-found-message">Page not found</div>
                    <a className="not-found-link" href="/">Go back to home</a>
                </div>
            </div>
        </>
    );
}
