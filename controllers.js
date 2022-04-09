const YoutubeUser = require("../models/youtubeUser.js");
const jwt = require('jsonwebtoken');
const google = require("googleapis").google;
const OAuth2 = google.auth.OAuth2;
const youtube = google.youtube("v3");

const keys = require("../config.js");

export function getLoginLink(req, res){
    const oauth2Client = initOauth();

    const link = oauth2Client.generateAuthUrl({
        access_type : "offline",
        scope : keys.authCred.scopes
    });

    return res.status(200).json({
        status : true,
        link : link
    })
}

export async function callbackHandler(req, res){
    const oauth2Client = initOauth();
    const { error, code } = req.query;
    if(error){
        return res.status(406).json({
            status : false,
            msg : "Unable to login please try again",
            error : error
        })
    }
    try {
        const { token } = await oauth2Client.getToken(code);
        const ticket = await oauth2Client.verifyIdToken({
            idToken : token.id_token,
            audience : keys.authCred.clientId
        });
        const payload = ticket.getPayload();
        const user = await YoutubeUser.findOneAndUpdate({id : payload.sub}, {
            $set : {
                id : payload.sub,
                profile : payload.picture,
                name : payload.name,
                access : token
            }
        }, {upsert : true, new : true});
        return res.status(200).json({
            msg : "Login Successful",
            user : {
                name : user.name,
                profile : user.profile,
                channel : user.channel,
                uploads : user.uploads,
                access : jwt.sign({
                    yt_access : user.access, 
                    id : user.id
                }, keys.jwtSecret)
            }
        })
    } catch (error) {
        return res.status(500).json({
            status : false,
            msg : "Unable to login please try again",
            error : error.message
        })
    }
}

export async function getChannel(req, res){
    const { id, yt_access } = req.user;
    try {
        const {
            channel, uploads, saved 
        } = await YoutubeUser.findOne({id : id}, {
            channel : 1, uploads : 1, saved : 1
        });
        if(channel.id){
            return res.status(200).json({
                status : true,
                data : {
                    channel, uploads, saved
                }
            });
        }
        const oauth2Client = initOauth();
        oauth2Client.credentials = yt_access;
        let channelResponse = await youtube.channels.list({
            auth : oauth2Client,
            mine : true,
            part : 'id,snippet,contentDetails,statistics',
            maxResults : 1
        });
        let channelData = channelResponse.data.items[0]
        let playlistId = channelData.contentDetails.relatedPlaylists.uploads;
        if(channelResponse.data.pageInfo.totalResults){
            let pliResponse = await youtube.playlistItems.list({
                auth : oauth2Client,
                playlistId : playlistId,
                part : 'snippet, contentDetails, id',
                maxResults : channelData.statistics.videoCount
            })
            let uploadsObject = {};
            pliResponse.data.items.forEach(item => {
                uploadsObject[item.id] = item;
            })
            const { channel, uploads } = await YoutubeUser.findOneAndUpdate({id : id}, {
                $set : { 
                    channel : channelResponse.data.items[0],
                    uploads : uploadsObject,
                    uploadListId : playlistId
                }
            }, { new : true });
            return res.status(200).json({
                status : true,
                data : {
                    channel, 
                    uploads : Object.keys(uploads).map(id => uploads[id])
                }
            })
        } else {
            return res.status(200).json({
                status : false,
                msg : "This User has no channel"
            })
        }
    } catch (error) {
        return res.status(500).json({
            status : false,
            msg : error.message
        })
    }
}

export async function getSaved(req, res){
    const { id } = req.user;
    try {
        const { saved, uploads } = await YoutubeUser.findOne({id : id}, {
            saved : 1, uploads : 1
        });
        let saved_videos = saved.map(id => uploads[id])
        return res.status(200).json({
            status : true,
            saved_videos : saved_videos
        });
    } catch (error) {
        
    }
}

export async function getVideo(req, res){
    const { yt_access, id } = req.user;
    const { videoId } = req.params;
    const oauth2Client = initOauth()
    oauth2Client.credentials = yt_access;
    try {
        const { data } = await youtube.videos.list({
            auth : oauth2Client,
            id : videoId,
            part : 'snippet, statistics, contentDetails'
        });
        const videoDetails = data.items[0];
        let update = { ["uploads"+id] : videoDetails }
        const { saved } = await YoutubeUser.findOneAndUpdate({id : id}, {
            $set : update
        }, { new : true });
        return res.status(200).json({
            status : true,
            data : {
                video : videoDetails,
                is_saved : saved.includes(videoId)
            }
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({
            status : false,
            msg : error.message
        })
    }
}

export async function refreshList(req, res){
    const { id, yt_access } = req.user;
    try {
        const { uploadListId, channel } = YoutubeUser.findOne({id: id}, {
            uploadListId : 1, channel : 1
        });
        if(uploadListId){
            const oauth2Client = initOauth()
            oauth2Client.credentials = yt_access;
            let pliResponse = await youtube.playlistItems.list({
                auth : oauth2Client,
                playlistId : uploadListId,
                part : 'snippet, contentDetails, id',
                maxResults : channel.statistics.videoCount
            });
            let uploadsObject = {};
            pliResponse.data.items.forEach(item => {
                uploadsObject[item.id] = item;
            })
            const { channel, uploads } = await YoutubeUser.findOneAndUpdate({id : id}, {
                $set : { 
                    uploads : uploadsObject
                }
            }, { new : true });
            return res.status(200).json({
                status : true,
                data : {
                    channel, 
                    uploads : Object.keys(uploads).map(id => uploads[id])
                }
            })
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status : false,
            msg : error.message
        })
    }
}

export async function saveToList(req, res){
    const { id } = req.user;
    const { videoId } = req.body;
    try {
        const { saved, uploads } = await YoutubeUser.findOneAndUpdate({
            id : id,
            ["uploads."+videoId+".id"] : videoId
        }, {
            $push : { saved : videoId }
        }, { new : true });
        return res.status(200).json({
            status : true,
            msg : "Video saved to list",
            data : {
                saveList : saved, 
                video : uploads[videoId]
            }
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status : false,
            msg : error.message
        })
    }
}

export async function removeFromList(req, res){
    const { id } = req.user;
    const { videoId } = req.body;
    try {
        const { saved, uploads } = await YoutubeUser.findOneAndUpdate({
            id : id,
            ["uploads."+videoId+".id"] : videoId
        }, {
            $pull : { saved : videoId }
        }, { new : true });
        return res.status(200).json({
            status : true,
            msg : "Video removed from list",
            data : {
                saveList : saved, 
                video : uploads[videoId]
            }
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status : false,
            msg : error.message
        })
    }
}

function initOauth(){
    return new OAuth2(
        keys.authCred.clientId,
        keys.authCred.clientSecret,
        keys.authCred.redirectUris
    )
}