const AuthorizeUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    , RedirectUrl = chrome.identity.getRedirectURL()
    , ClientId = 'de413af1-cda6-4ec2-a1a1-b9037d5f4f81'
    , ClientSecret = 'tcobSXZZ8813+|!)gqvQWP7'
    , Scope = 'UserActivity.ReadWrite.CreatedByApp offline_access';

const data = {
    "appActivityId": "/article?12345",
    "activitySourceHost": "https://www.contoso.com",
    "userTimezone": "Africa/Casablanca",
    "appDisplayName": "Contoso, Ltd.",
    "activationUrl": "http://www.contoso.com/article?id=12345",
    "contentUrl": "http://www.contoso.com/article?id=12345",
    "fallbackUrl": "http://www.contoso.com/article?id=12345",
    "visualElements": {
        "attribution": {
            "iconUrl": "http://www.contoso.com/icon",
            "alternateText": "Contoso, Ltd.",
            "addImageQuery": "false"
        },
        "description": "How to Tie a Reef Knot. A step-by-step visual guide to the art of nautical knot-tying.",
        "backgroundColor": "#ff0000",
        "displayText": "Contoso How-To: How to Tie a Reef Knot",
        "content": {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "body":
            [{
                "type": "TextBlock",
                "text": "Contoso MainPage"
            }]
        }
    }
};

function queryString(args){
  const keys = Object.keys(args);
  return keys.map(k => `${k}=${encodeURIComponent(args[k])}`).join('&');
}

function formatUrl(url, args){
  return `${url}?${queryString(args)}`;
}

function getToken(args){
  const body = queryString(args);
  return new Promise(done => {
    fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      body: body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      method: 'POST'
    }).then(r => r.json())
    .then(r => {
      if(r.token_type){
        chrome.storage.sync.set({
          access_token: r.access_token,
          refresh_token: r.refresh_token,
        }, done);
      }
    });
  });
}

function getTokenWithRefreshToken(refreshToken){
  return getToken({
    'grant_type': 'refresh_token',
    'refresh_token': refreshToken,
    'client_id': ClientId,
    'client_secret': ClientSecret,
    'redirect_uri': RedirectUrl,
  });
}

function getTokenWithCode(code){
  return getToken({
    'grant_type': 'authorization_code',
    'code': code,
    'client_id': ClientId,
    'client_secret': ClientSecret,
    'redirect_uri': RedirectUrl,
  });
}

function makeActivity(activity){
  const uri = activity.uri;
  const date = new Date().toISOString();
  return {
    "appActivityId": activity.id,
    "activitySourceHost": activity.host,
    "userTimezone": "America/Los Angeles",
    "appDisplayName": "Firefox",
    "activationUrl": uri,
    "fallbackUrl": uri,
    "contentInfo": {
      "@context": "http://schema.org",
      "@type": "CreativeWork",
      "author": "Jennifer Booth",
      "name": "Graph Explorer User Activity"
    },
    "visualElements": {
        "attribution": {
            "iconUrl": activity.icon || "https://www.mozilla.org//media/img/firefox/favicon-196.c6d9abffb769.png",
            "alternateText": activity.title || activity.uri,
            "addImageQuery": "false",
        },
        "description": activity.description || "",
        "backgroundColor": "#cc0d65",
        "displayText": activity.title || activity.uri,
        "content": {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "backgroundImage": activity.image,
            "body":
            [{
                "type": "TextBlock",
                "size": "large",
                "weight": "bolder",
                "text": activity.title,
                "wrap": true,
                "maxLines": 3
            },{
                "type": "TextBlock",
                "text": uri,
                "wrap": true,
                "maxLines": 3
            }]
        }
    },
    "historyItems":[
      {
          "userTimezone": "America/Los Angeles",
          "startedDateTime": date,
          "lastActiveDateTime": date,
      }
    ]
  };
}

function putCore(activity, pair){
  const data = makeActivity(activity);
  fetch('https://graph.microsoft.com/v1.0/me/activities/' + encodeURIComponent(activity.id), {
    body: JSON.stringify(data),
    cache: 'no-cache',
    headers: {
      'authorization': `Bearer ${pair.access_token}`,
      'content-type': 'application/json',
    },
    method: 'PUT',
  })
  .then(r => {
    if(r.status === 401){
      // try to refresh
      getTokenWithRefreshToken(pair.refresh_token)
      .then(_ => putTimeline({activity}));
    }else{
      // ok
    }
  });
}

function putTimeline(message){
  chrome.storage.sync.get(['access_token', 'refresh_token'], function(result){
    if(!result.access_token) return;
    putCore(message.activity, result);
  });
}

function startAuth(){
  const url = formatUrl(AuthorizeUrl, {
    'client_id': ClientId,
    'response_type': 'code',
    'redirect_uri': RedirectUrl,
    'response_mode': 'query',
    'scope': Scope,
  });
  chrome.identity.launchWebAuthFlow(
    {
      'url': url,
      'interactive': true
    }, redirect_url => {
      const code = (redirect_url.match(/code=([^&]+)/))[1];
      getTokenWithCode(code);
    }
  );
}

chrome.runtime.onMessage.addListener(function(message, callback){
  if(message.op === 'put'){
    putTimeline(message);
  }
  if(message.op === 'auth'){
    startAuth();
  }
});
