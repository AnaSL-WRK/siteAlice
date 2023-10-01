const paintings = [
    {
        imageSrc: 'src/img/1.jpeg',
        description: 'Description for Painting 1',
    },
    {
        imageSrc: 'src/img/2.jpeg',
        description: 'Description for Painting 2',
    },
    // Add more paintings and descriptions as needed
];


function getRandomPainting() {
    const randomIndex = Math.floor(Math.random() * paintings.length);
    const randomPainting = paintings[randomIndex];

    const randomPaintingElement = document.getElementById('randomPainting');
    const paintingDescriptionElement = document.getElementById('paintingDescription');
    const paintingTextElement = document.getElementById('paintingText');

    randomPaintingElement.src = randomPainting.imageSrc;
    console.log(randomPainting.imageSrc);
    paintingDescriptionElement.innerText = randomPainting.description;
    // Update other elements as needed

    // You can also add additional logic to ensure the same painting doesn't appear on the same day
}

// Call the function to load a random painting when the page loads
getRandomPainting();



// Refresh the page every 24 hours (86400000 milliseconds)
//setInterval(() => {
//    location.reload();
//}, 86400000);
//