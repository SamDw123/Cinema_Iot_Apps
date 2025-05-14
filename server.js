// laad .env in en zet alle variabelen in process.env
require('dotenv').config();

// haal meteen de TMDB-gegevens en poort uit de omgevingsvariabelen
const API_KEY = process.env.TMDB_API_KEY;
const READ_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const PORT = process.env.PORT || 4000;
