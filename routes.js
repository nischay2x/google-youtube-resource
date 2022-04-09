const express = require("express");
const router = express.Router();
const keys = require('../config.js');
const { 
    getLoginLink, callbackHandler, getChannel, 
    getSaved, getVideo, refreshList, saveToList, 
    removeFromList 
} = require("./controllers");

function authenticateToken(req, res, next){
    const authHeader = req.headers['authorization']
    if(!authHeader) return res.status(403)
    const token = authHeader && authHeader.split(' ')[1]
    if( token == null ) return res.sendStatus(401)
    jwt.verify(token, keys.jwtSecret, (err, user) => {
        if(err) return res.sendStatus(403)
        req.user = user
        next()
    })
}

router.get("/login-link", getLoginLink);
router.get("/login-callback", callbackHandler);
router.get("/channel", authenticateToken, getChannel);
router.get("/saved", authenticateToken, getSaved);
router.get("/video/:videoId", authenticateToken, getVideo);
router.get("/refresh-list", authenticateToken, refreshList);
router.post("/save", authenticateToken, saveToList);
router.post("/remove", authenticateToken, removeFromList);

module.exports = router;
