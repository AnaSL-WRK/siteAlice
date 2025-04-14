// components/Footer.js
const Footer = () => {
    return (
      <>
        <div className="line"></div>
        <div className="footer-basic">
          <footer style={{ textAlign: 'center' }}>
            <p>
              Para informações sobre os quadros, contactar através do email ou do instagram.
            </p>
            <div className="social">
              <a href="mailto:alicenasartes@gmail.com">
                <i className="fa-regular fa-envelope"></i>
              </a>
              <a href="https://www.instagram.com/alicedefatimaloureiro/">
                <i className="fa-brands fa-instagram"></i>
              </a>
            </div>
          </footer>
        </div>
      </>
    );
  };
  
  export default Footer;
  