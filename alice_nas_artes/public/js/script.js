const paintings = [
    {
        imageSrc: 'src/img/quadros/Picture1.jpg',
        description: 'Se eu quisesse dizia que era um manjerico',
        year: 2023,
        dimensions: '100 x 80 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture3.jpg',
        description: 'ERA UMA VEZ...alguém que andou a grafitar o céu! (1)',
        year: 2024,
        dimensions: '70 x 50 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture11.jpg',
        description: 'De vez em quando a magnólia gosta de espreitar ao sol...',
        year: 2024,
        dimensions: '60 x 50 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture7.jpg',
        description: 'ERA UMA VEZ... um jardim de inverno às cinco da tarde...',
        year: 2024,
        dimensions: '100 x 70 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture8.jpg',
        description: 'ERA UMA VEZ...catos que passam a vida na boa vida.',
        year: 2024,
        dimensions: '70 x 100 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture9.jpg',
        description: 'ERA UMA VEZ....ao longe!',
        year: 2024,
        dimensions: '120 x 90 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture14.png',
        description: 'ERA UMA VEZ...dezassete amendoeiras em flor...',
        year: 2024,
        dimensions: '120 x 90 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture15.jpg',
        description: '"ERA UMA VEZ... 3 ...duas oliveiras e...uma... amendoeira em flor"',
        year: 2024,
        dimensions: '120 x 90 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture16.jpg',
        description: 'Fato novo para fim de estação...',
        year: 2023,
        dimensions: '70 x 60 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture2.png',
        description: 'Sim...são manjericos',
        year: 2023,
        dimensions: '100 x 70 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture4.jpg',
        description: 'ERA UMA VEZ...alguém que andou a grafitar o céu! (2)',
        year: 2024,
        dimensions: '70 x 50 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture12.jpg',
        description: 'ERA UMA VEZ ... uma formiga que olhava para uma magnólia!',
        year: 2024,
        dimensions: '90 x 70 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture17.jpg',
        description: 'À espera do outono para mudar de roupa...',
        year: 2023,
        dimensions: '70 x 60 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture18.jpg',
        description: 'Título em branco...mas mesmo em branco...',
        year: 2023,
        dimensions: '51 x 48 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture19.jpg',
        description: 'Sonhei com um deserto...ou perto...',
        year: 2023,
        dimensions: '80 x 120 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture20.jpg',
        description: 'Na próxima primavera haverá flores com cores...',
        year: 2023,
        dimensions: '80 x 70 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture22.jpg',
        description: 'Era uma vez um portão desnecessário...',
        year: 2023,
        dimensions: '80 x 60 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture5.jpg',
        description: 'ERA UMA VEZ...alguém que andou a grafitar o céu! (3)',
        year: 2024,
        dimensions: '70 x 50 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture10.jpg',
        description: 'Gosto de flores que alegram o inverno',
        year: 2024,
        dimensions: '70 x 60 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture13.jpg',
        description: 'ERA UMA VEZ...uma abelha que olhava para duas flores de amendoeira!',
        year: 2024,
        dimensions: '80 x 60 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture23.jpg',
        description: 'Sim... sim... é  uma ponte...',
        year: 2023,
        dimensions: '50 x 70 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture24.jpg',
        description: 'Campo de trigo maduro',
        year: 2023,
        dimensions: '50 x 60 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture25.jpg',
        description: 'Há papoilas por trás do verde...',
        year: 2023,
        dimensions: '60 x 80 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture26.jpg',
        description: 'Encontro com Karl Blossfeldt',
        year: 2022,
        dimensions: '50 x 60 cm',
    },
    {
        imageSrc: 'src/img/quadros/Picture21.jpg',
        description: 'Quando descansar vou subir as escadas e espreitar...',
        year: 2023,
        dimensions: '50 x 70 cm',
    }
    // Add more paintings and descriptions as needed
];


const photos = [];

for (let i = 1; i <= 50; i++) {
    photos.push({
        imageSrc: `src/img/foto/estruturas/e${i}.jpg`,
    });
}

for (let i = 1; i <= 35; i++) {
    photos.push({
        imageSrc: `src/img/foto/livre/tl${i}.jpg`,
    });
}

for (let i = 1; i <= 113; i++) {
    photos.push({
        imageSrc: `src/img/foto/natureza/n${i}.jpg`,
    });
}

for (let i = 1; i <= 20; i++) {
    photos.push({
        imageSrc: `src/img/foto/praia/p${i}.jpg`,
    });
}


function getRandomPainting() {
    document.addEventListener('DOMContentLoaded', function() {
        const date = new Date();
        const dayOfMonth = date.getDate();
        const randomPainting = paintings[dayOfMonth % paintings.length];

        let randomPaintingElement = document.getElementById('randomPainting');
        const paintingDescriptionElement = document.getElementById('paintingDescription');
        const paintingYearElement = document.getElementById('paintingYear');
        const paintingDimensionsElement = document.getElementById('paintingDimensions');

        // Set the image source
        randomPaintingElement.src = randomPainting.imageSrc;

        // Set the description, year, and dimensions
        paintingDescriptionElement.innerText = randomPainting.description;
        paintingYearElement.innerText = randomPainting.year;
        paintingDimensionsElement.innerText = randomPainting.dimensions;
    });
}

function getRandomPhoto() {
    document.addEventListener('DOMContentLoaded', function() {
        const date = new Date();
        const dayOfMonth = date.getDate();
        const randomFoto = photos[dayOfMonth % photos.length];

        let randomPhotoElement = document.getElementById('randomFoto');

        // Set the image source
        randomPhotoElement.src = randomFoto.imageSrc;

     
    });
}

getRandomPainting();
getRandomPhoto();
