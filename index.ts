import figlet from 'figlet';
import info from './static/info.html'

const server = Bun.serve({
  port: 6741,
  routes: {
    "/": info, 
    "/figlet": () => {
      const body = figlet.textSync('Bun!');
      return new Response(body);
    }
  }
});

console.log(`Listening on ${server.url}`);