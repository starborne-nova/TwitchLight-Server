const express = require('express');
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn;

const ensureLoggedIn = ensureLogIn();
const router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  if (!req.user) { return res.render('home'); }
  next();
}, function(req, res, next) {
  res.render('index', { user: req.user });
});

router.get('/active', ensureLoggedIn, function(req, res, next) {
  res.render('index', { user: req.user });
});

router.get('/completed', ensureLoggedIn, function(req, res, next) {
  res.render('index', { user: req.user });
});

module.exports = router;