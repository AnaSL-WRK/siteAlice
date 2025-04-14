import Script from 'next/script';
import React from 'react';

export default function HomePage() {
  return (
    <>
      <div className="container">
      <h1 style={{ margin: "0 0 30px 0", fontSize: "40px" }}>Pintura do dia</h1>
      <div className="painting-container">
      <img
          id="randomFoto"
          src={null}
          alt="Random Photo"
          className="painting-image"
        />
        <div className="painting-details">
          <p id="paintingDescription" className="painting-description"></p>
          <p id="paintingYear" className="painting-year"></p>
          <p id="paintingDimensions" className="painting-dimensions"></p>
        </div>
      </div>
    </div>

    <div className="container">
      <h1 style={{ margin: "100px 0 25px 0", fontSize: "40px" }}>
        Fotografia do dia
      </h1>
      <div className="foto-container" style={{ paddingBottom: "50px" }}>
      <img
        id="randomPainting"
        src={null}
        alt="Random Painting"
        className="painting-image"
      />
      </div>
    </div>

    <div className="line"></div>


    {/* External scripts */}
    <Script src="/js/script.js" strategy="afterInteractive" />
  </>
  );
}


