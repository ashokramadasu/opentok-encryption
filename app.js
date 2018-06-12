// Dependencies
var express = require('express'),
    bodyParser = require('body-parser'),
    request = require('request'),
    jwt = require('jsonwebtoken'),
    OpenTok = require('opentok');

// Verify that the API Key and API Secret are defined
const apiKey = process.env.TOKBOX_API_KEY;
const apiSecret = process.env.TOKBOX_SECRET;
const port  = process.env.PORT || 3000;
const accessKey = process.env.ACCESS_KEY;
const secret = process.env.SECRET;
const certificate = process.env.CERTIFICATE;
const bucket = process.env.BUCKET;

if (!apiKey || !apiSecret) {
  console.log('You must specify API_KEY and API_SECRET environment variables');
  process.exit(1);
}

// Initialize the express app
var app = express();
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


// Initialize OpenTok
var opentok = new OpenTok(apiKey, apiSecret);

// Create a session and store it in the express app
opentok.createSession({ mediaMode: 'routed' }, function (err, session) {
  if (err) throw err;
  app.set('sessionId', session.sessionId);
  token = opentok.generateToken(session.sessionId, { role: 'moderator' });
  // We will wait on starting the app until this is done
  init();
});

//index page route
app.get('/', function (req, res) {
  res.render('index.ejs');
});

// callback url route
app.post('/callback', (req, res) => {
  console.log('you are in callbackurl --post');
  console.log(JSON.stringify(req.body, null, 2));
  res.send(req.body);
})

app.get('/callback', (req, res) => {
  console.log('you are in callbackurl');
  res.send('you are in callbackurl');
})

app.get('/host', function (req, res) {
  var sessionId = app.get('sessionId'),
    // generate a fresh token for this client
    token = opentok.generateToken(sessionId, { role: 'moderator' });

  res.render('host.ejs', {
    apiKey: apiKey,
    sessionId: sessionId,
    token: token
  });
});

app.get('/participant', function (req, res) {
  var sessionId = app.get('sessionId'),
    // generate a fresh token for this client
    token = opentok.generateToken(sessionId, { role: 'moderator' });

  res.render('participant.ejs', {
    apiKey: apiKey,
    sessionId: sessionId,
    token: token
  });
});

app.get('/history', function (req, res) {
  var page = req.param('page') || 1,
    offset = (page - 1) * 5;
  opentok.listArchives({ offset: offset, count: 5 }, function (err, archives, count) {
    if (err) return res.send(500, 'Could not list archives. error=' + err.message);
    res.render('history.ejs', {
      archives: archives,
      showPrevious: page > 1 ? ('/history?page=' + (page - 1)) : null,
      showNext: (count > offset + 5) ? ('/history?page=' + (page + 1)) : null
    });
  });
});

app.get('/download/:archiveId', function (req, res) {
  var archiveId = req.param('archiveId');
  opentok.getArchive(archiveId, function (err, archive) {
    if (err) return res.send(500, 'Could not get archive ' + archiveId + '. error=' + err.message);
    res.redirect(archive.url);
  });
});



app.post('/start', function (req, res) {
  console.log(req.body);
  let uri = 'https://api.opentok.com/v2/project/' + apiKey + '/archive/storage';
  var hasAudio = (req.param('hasAudio') !== undefined);
  var hasVideo = (req.param('hasVideo') !== undefined);
  var outputMode = req.param('outputMode');
  let data = {
    "type": "s3",
    "config": {
      "bucket": bucket,
      "secretKey": accessKey,
      "accessKey": secret
    },
    "fallback": "none",
    "certificate": certificate
  }

  var currentTime = Math.floor(new Date() / 1000);
  let key = jwt.sign({
    "iss": apiKey,
    "iat": currentTime,
    "exp": currentTime + 180,
    "ist": "project",
    "jti": "jwt_nonce"
  },
    apiSecret,
    {
      algorithm: 'HS256'
    })
  console.log(data);
  request({
    url: uri,
    method: 'PUT',
    headers: { 'X-OPENTOK-AUTH': key },
    json: data
  }, function (err, data) {
    if (err) return res.send(500,
      'Could not start archive for session ' + sessionId + '. error=' + err.message
    );
    console.log('data details ' + JSON.stringify(data, null, 2));
    // res.json(archive);
    opentok.startArchive(app.get('sessionId'), {
      name: 'Node Opentok Encryption App',
      hasAudio: hasAudio,
      hasVideo: hasVideo,
      outputMode: outputMode
    }, function (err, archive) {
      if (err) return res.send(500,
        'Could not start archive for session ' + sessionId + '. error=' + err.message
      );
      console.log('archive details ' + JSON.stringify(archive, null, 2));
      res.json(archive);
    });
  });
});

app.post('/startold', function (req, res) {
  console.log(req.body);
  var hasAudio = (req.param('hasAudio') !== undefined);
  var hasVideo = (req.param('hasVideo') !== undefined);
  var outputMode = req.param('outputMode');
  opentok.startArchive(app.get('sessionId'), {
    name: 'Node Opentok Encryption App',
    hasAudio: hasAudio,
    hasVideo: hasVideo,
    outputMode: outputMode
  }, function (err, archive) {
    if (err) return res.send(500,
      'Could not start archive for session ' + sessionId + '. error=' + err.message
    );
    res.json(archive);
  });
});

app.get('/stop/:archiveId', function (req, res) {
  var archiveId = req.param('archiveId');
  opentok.stopArchive(archiveId, function (err, archive) {
    if (err) return res.send(500, 'Could not stop archive ' + archiveId + '. error=' + err.message);
    res.json(archive);
  });
});

app.get('/delete/:archiveId', function (req, res) {
  var archiveId = req.param('archiveId');
  opentok.deleteArchive(archiveId, function (err) {
    if (err) return res.send(500, 'Could not stop archive ' + archiveId + '. error=' + err.message);
    res.redirect('/history');
  });
});

// Start the express app
function init() {
  app.listen(port, function () {
    console.log('Express Server running at http://localhost:' + port + '/');
  });
}