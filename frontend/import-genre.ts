// To run this script, you need to have ts-node and axios installed.
// You can install them by running: npm install -g ts-node axios
//
// Then, you can run the script with the following command:
// ts-node import-genre.ts <bearer_token>
//
// Replace <bearer_token> with your actual bearer token.

import axios from 'axios';

const postGenres = async (genres: any[], token: string) => {
  try {
    const response = await axios.post('http://localhost:8080/genre', genres, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(`Successfully posted ${genres.length} genres. Status: ${response.status}`);
  } catch (error) {
    console.error('Error posting genres:', error);
  }
};

const fetchAndPostGenres = async (token: string) => {
  for (let offset = 1; offset <= 200; offset++) {
    try {
      const response = await axios.get(`https://musicbrainz.org/ws/2/genre/all?fmt=json&offset=${offset}`);
      const genres = response.data.genres.map((genre: any) => ({
        id: genre.id,
        name: genre.name
      }));

      if (genres.length > 0) {
        await postGenres(genres, token);
      } else {
        console.log(`No more genres to fetch at offset ${offset}. Exiting.`);
        break;
      }
    } catch (error) {
      console.error(`Error fetching genres at offset ${offset}:`, error);
    }
  }
};

const token = process.argv[2];
if (!token) {
  console.error('Please provide a bearer token as a command-line argument.');
  process.exit(1);
}

fetchAndPostGenres(token);
