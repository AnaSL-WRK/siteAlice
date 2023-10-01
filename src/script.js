const paintings = [
    {
        imageSrc: 'src/img/1.jpeg',
        title: 'Painting 1',
        description: 'Se eu quisesse dizia que era um manjerico',
    },
    {
        imageSrc: 'src/img/2.jpeg',
        description: 'Na próxima primavera haverá flores com cores...',
    },
    {
        imageSrc: 'src/img/3.jpeg',
        description: 'Quando descansar vou subir as escadas e espreitar...',
    },
    {
        imageSrc: 'src/img/3.png',
        description: 'Fato novo para fim de estação...',
    },
    {
        imageSrc: 'src/img/11.jpeg',
        description: 'Título em branco',
    },
    {
        imageSrc: 'src/img/12.jpeg',
        description: 'Há papaiolas debaixo do verde',
    },
    {
        imageSrc: 'src/img/12.png',
        description: 'À espera do outono para mudar de roupa...',
    },
    {
        imageSrc: 'src/img/21.png',
        description: 'Sim...são manjericos',
    },
    {
        imageSrc: 'src/img/31.jpeg',
        description: 'Era uma vez um portão desnecessário...',
    },
    {
        imageSrc: 'src/img/32.jpeg',
        description: 'Campo de trigo',
    },
    {
        imageSrc: 'src/img/33.jpeg',
        description: 'Sim...sim...é uma ponte...',
    },
    {
        imageSrc: 'src/img/34.jpeg',
        description: 'Sonhei com um deserto...ou perto!',
    },
    {
        imageSrc: 'src/img/41.jpeg',
        description: 'Título em branco',
    },
    {
        imageSrc: 'src/img/42.jpeg',
        description: 'Título em branco',
    },
    {
        imageSrc: 'src/img/43.jpeg',
        description: 'Título em branco',
    },
    {
        imageSrc: 'src/img/44.jpeg',
        description: 'Título em branco',
    },
  
    // Add more paintings and descriptions as needed
];


function getRandomPainting() {
    document.addEventListener('DOMContentLoaded', function() {
    const randomIndex = Math.floor(Math.random() * paintings.length);
    const randomPainting = paintings[randomIndex];

    let randomPaintingElement = document.getElementById('randomPainting');
    const paintingDescriptionElement = document.getElementById('paintingDescription');

    randomPaintingElement.src = randomPainting.imageSrc;
    paintingDescriptionElement.innerText = randomPainting.description;
    // Update other elements as needed

    
    // You can also add additional logic to ensure the same painting doesn't appear on the same day
});
}

// Call the function to load a random painting when the page loads
getRandomPainting();



// Refresh the page every 24 hours (86400000 milliseconds)
setInterval(() => {
    location.reload();
}, 86400000);
