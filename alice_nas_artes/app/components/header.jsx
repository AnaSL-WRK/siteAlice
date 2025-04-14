// components/Header.js
import Link from 'next/link';

const Header = () => {
    return (
        <header className="header">
               <div className="container">
                    <div className="logo">
                        <Link href="/">
                            <h1 style={{ fontSize: '70px' }}>Alice nas Artes</h1>
                        </Link>
                    </div> 
                </div>

                <div className="line"></div>

            <nav className="navbar navbar-expand-lg" role="navigation">
            <div className="navbar-nav">
                <ul>
                    <li> <Link href="/pinturas"> Pinturas </Link></li>
                    <li><Link href="/fotografia"> Fotografia <i className="fa-solid fa-chevron-down" style={{ paddingLeft: '10px' }}></i> </Link></li>
                        <ul className="submenu">
                            <li> <Link href="/fotografia#estruturas"> Estruturas </Link></li>
                            <li><Link href="/fotografia#praia"> Praia </Link></li>
                            <li> <Link href="/fotografia#natureza"> Natureza </Link></li>
                            <li><Link href="/fotografia#tema_livre"> Tema Livre </Link></li>
                        </ul>

                    <li><Link href="/mista"> Técnica Mista </Link></li>
                    <li><Link href="/biografia"> Biografia </Link></li>
                    <li><a href="/alicenasartes.pdf" target="_blank" rel="noopener noreferrer">Portfolio </a></li>
                </ul>
            </div>
            </nav>
        </header>
    );
};

export default Header;