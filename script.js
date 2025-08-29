// Workaround for Render deployment issue
// Render is looking for script.js instead of server.js
// This file simply redirects to the actual server
require('./server.js');