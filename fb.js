(function() {

    var FB = (function() {

        var debugReq = require('debug')('fb:req'),
            debugSig = require('debug')('fb:sig'),
            request  = require('request'),
            fs       = require('fs'),
            URL      = require('url'),
            QS       = require('querystring'),
            crypto   = require('crypto'),
            version  = require('./package.json').version,
            getLoginUrl,
            api,
            napi,
            nodeifyCallback,
            graph,
            rest,
            oauthRequest,
            parseOAuthApiResponse,
            stringifyParams,
            setAccessToken,
            getAccessToken,
            getAppSecretProof,
            parseSignedRequest,
            base64UrlDecode,
            log,
            has,
            options,
            METHODS = ['get', 'post', 'delete', 'put'],
            opts = {
                'accessToken': null,
                'appId': null,
                'appSecret': null,
                'appSecretProof': null,
                'beta': false,
                'version': 'v2.0',
                'timeout': null,
                'scope':  null,
                'redirectUri': null,
                'proxy': null,
                'userAgent': 'thuzi_nodejssdk/' + version
            },
            readOnlyCalls = {
                'admin.getallocation': true,
                'admin.getappproperties': true,
                'admin.getbannedusers': true,
                'admin.getlivestreamvialink': true,
                'admin.getmetrics': true,
                'admin.getrestrictioninfo': true,
                'application.getpublicinfo': true,
                'auth.getapppublickey': true,
                'auth.getsession': true,
                'auth.getsignedpublicsessiondata': true,
                'comments.get': true,
                'connect.getunconnectedfriendscount': true,
                'dashboard.getactivity': true,
                'dashboard.getcount': true,
                'dashboard.getglobalnews': true,
                'dashboard.getnews': true,
                'dashboard.multigetcount': true,
                'dashboard.multigetnews': true,
                'data.getcookies': true,
                'events.get': true,
                'events.getmembers': true,
                'fbml.getcustomtags': true,
                'feed.getappfriendstories': true,
                'feed.getregisteredtemplatebundlebyid': true,
                'feed.getregisteredtemplatebundles': true,
                'fql.multiquery': true,
                'fql.query': true,
                'friends.arefriends': true,
                'friends.get': true,
                'friends.getappusers': true,
                'friends.getlists': true,
                'friends.getmutualfriends': true,
                'gifts.get': true,
                'groups.get': true,
                'groups.getmembers': true,
                'intl.gettranslations': true,
                'links.get': true,
                'notes.get': true,
                'notifications.get': true,
                'pages.getinfo': true,
                'pages.isadmin': true,
                'pages.isappadded': true,
                'pages.isfan': true,
                'permissions.checkavailableapiaccess': true,
                'permissions.checkgrantedapiaccess': true,
                'photos.get': true,
                'photos.getalbums': true,
                'photos.gettags': true,
                'profile.getinfo': true,
                'profile.getinfooptions': true,
                'stream.get': true,
                'stream.getcomments': true,
                'stream.getfilters': true,
                'users.getinfo': true,
                'users.getloggedinuser': true,
                'users.getstandardinfo': true,
                'users.hasapppermission': true,
                'users.isappuser': true,
                'users.isverified': true,
                'video.getuploadlimits': true
            };

        /**
         *
         * @access public
         * @param path {String} the url path
         * @param method {String} the http method (default: `"GET"`)
         * @param params {Object} the parameters for the query
         * @param cb {Function} the callback function to handle the response
         */
        api = function() {
            //
            // FB.api('/platform', function(response) {
            //  console.log(response.company_overview);
            // });
            //
            // FB.api('/platform/posts', { limit: 3 }, function(response) {
            // });
            //
            // FB.api('/me/feed', 'post', { message: body }, function(response) {
            //  if(!response || response.error) {
            //      console.log('Error occured');
            //  } else {
            //      console.log('Post ID:' + response.id);
            //  }
            // });
            //
            // var postId = '1234567890';
            // FB.api(postId, 'delete', function(response) {
            //  if(!response || response.error) {
            //      console.log('Error occurred');
            //  } else {
            //      console.log('Post was deleted');
            //  }
            // });
            //
            //
            if(typeof arguments[0] === 'string') {
                graph.apply(this, arguments);
            }
            else {
                rest.apply(this, arguments);
            }
        };

        /**
         *
         * Make a api call to Graph server.
         *
         * Except the path, all arguments to this function are optiona. So any of
         * these are valid:
         *
         *  FB.api('/me') // throw away the response
         *  FB.api('/me', function(r) { console.log(r) })
         *  FB.api('/me', { fields: 'email' }); // throw away response
         *  FB.api('/me', { fields: 'email' }, function(r) { console.log(r) });
         *  FB.api('/123456789', 'delete', function(r) { console.log(r) } );
         *  FB.api(
         *      '/me/feed',
         *      'post',
         *      { body: 'hi there' },
         *      function(r) { console.log(r) }
         *  );
         *
         */
        graph = function() {
            var args = Array.prototype.slice.call(arguments),
                path = args.shift(),
                next = args.shift(),
                method,
                params,
                cb;

            while(next) {
                var type = typeof next;
                if(type === 'string' && !method) {
                    method = next.toLowerCase();
                }
                else if(type === 'function' && !cb) {
                    cb = next;
                }
                else if(type === 'object' && !params) {
                    params = next;
                }
                else {
                    log('Invalid argument passed to FB.api(): ' + next);
                    return;
                }
                next = args.shift();
            };

            method = method || 'get';
            params = params || {};

            // remove prefix slash if one is given, as it's already in the base url
            if(path[0] === '/') {
                path = path.substr(1);
            }

            if(METHODS.indexOf(method) < 0) {
                log('Invalid method passed to FB.api(): ' + method);
                return;
            }

            oauthRequest('graph', path, method, params, cb);
        };

        /**
         * Old school restserver.php calls.
         *
         * @access private
         * @param params { Object } The required arguments vary based on the method
         * being used, but speficy the method itself is mandatory:
         */
        rest = function(params, cb) {
            var method = params.method.toLowerCase();

            params.format = 'json-strings';
            var domain = readOnlyCalls[method] ? 'api_read' : 'api';
            oauthRequest(domain, 'restserver.php', 'get', params, cb);
        };

        /**
         * Add the oauth parameter, and fire of a request.
         *
         * @access private
         * @param domain {String}   the domain key, one of 'api', 'api_read',
         *                          or 'graph'
         * @param path {String}     the request path
         * @param method {String}   the http method
         * @param params {Object}   the parameters for the query
         * @param cb {Function}     the callback function to handle the response
         */
        oauthRequest = function(domain, path, method, params, cb) {
            var uri,
                parsedUri,
                query,
                body,
                formData,
                key,
                value,
                requestOptions,
                isOAuthRequest,
                pool;

            cb = cb || function() {};
            if(!params.access_token) {
                if(opts.accessToken) {
                    params.access_token = opts.accessToken;
                    if(opts.appSecret) {
                        params.appsecret_proof = opts.appSecretProof;
                    }
                }
            }
            else if(!params.appsecret_proof && opts.appSecret) {
                params.appsecret_proof = getAppSecretProof(params.access_token, opts.appSecret);
            }

            if(domain === 'graph') {
                if(!/^v\d+\.\d+\/|^fql(?:\/|$)/.test(path)) {
                    path = options('version') + '/' + path;
                }
                uri = 'https://graph.' + (options('beta') ? 'beta.' : '') + 'facebook.com/' + path;
                isOAuthRequest = /^oauth.*/.test('oauth/');
            }
            else if(domain == 'api') {
                uri = 'https://api.' + (options('beta') ? 'beta.' : '') + 'facebook.com/' + path;
            }
            else if(domain == 'api_read') {
                uri = 'https://api-read.' + (options('beta') ? 'beta.' : '') + 'facebook.com/' + path;
            }

            parsedUri = URL.parse(uri);
            delete parsedUri.search;
            parsedQuery = QS.parse(parsedUri.query);

            if(method === 'post') {
                if(params.access_token) {
                    parsedQuery.access_token = params.access_token;
                    delete params.access_token;

                    if(params.appsecret_proof) {
                        parsedQuery.appsecret_proof = params.appsecret_proof;
                        delete params.appsecret_proof;
                    }
                }

                if(params.file) {

                    formData = buildFormData(params);

                }//if
                else {

                    body = stringifyParams(params);

                }//else

            } else {
                for(key in params) {
                    parsedQuery[key] = params[key];
                }
            }

            parsedUri.search = stringifyParams(parsedQuery);
            uri = URL.format(parsedUri);

            pool = { maxSockets: options('maxSockets') || Number(process.env.MAX_SOCKETS) || 5 };
            requestOptions = {
                method: method,
                uri: uri,
                pool: pool
            };
            if(formData) {
                requestOptions['formData'] = formData;
            }
            if(body) {
                requestOptions['body'] = body;
            }
            if(options('proxy')) {
                requestOptions['proxy'] = options('proxy');
            }
            if(options('timeout')) {
                requestOptions['timeout'] = options('timeout');
            }
            if(options('userAgent')) {
                requestOptions['headers'] = {
                    'User-Agent': options('userAgent')
                };
            }

            debugReq(method.toUpperCase() + ' ' + uri);
            request(requestOptions,
                function(error, response, body) {
                    if(error !== null) {
                        if(error === Object(error) && has(error, 'error')) {
                            return cb(error);
                        }
                        return cb({error:error});
                }

                if(isOAuthRequest && response && response.statusCode === 200 &&
                    response.headers && /.*text\/plain.*/.test(response.headers['content-type'])) {
                    cb(parseOAuthApiResponse(body));
                }
                else {
                    var json;
                    try{
                        json = JSON.parse(body);
                    }
                    catch(ex) {
                        // sometimes FB is has API errors that return HTML and a message
                        // of "Sorry, something went wrong". These are infrequent and unpredictable but
                        // let's not let them blow up our application.
                        json =  {
                            error: {
                                code: 'JSONPARSE',
                                Error: ex
                            }
                        };
                    }
                    cb(json);
                }
            });
        };

        parseOAuthApiResponse = function(body) {
            var result,
                key;

            result = QS.parse(body);
            for(key in result) {
                if(!isNaN(result[key])) {
                    result[key] = parseInt(result[key]);
                }
            }

            return result;
        };

        buildFormData = function(params) {
            var data = {},
                key,
                i,
                value;

            for(key in params) {
                value = params[key];
                if(key == "file") {

                    if(value && typeof value == "object") {

                        for(i in value) {

                            data[key+'_'+i] = fs.createReadStream(value[i]);

                        }//for

                    }//if
                    else {

                        data[key] = fs.createReadStream(value);

                    }//else

                }//if
                else {

                    if(value && typeof value !== 'string') {
                        value = JSON.stringify(value);
                    }
                    if(value !== undefined) {
                        data[key] = value;
                    }

                }//else
            }

            return data;
        };

        stringifyParams = function(params) {
            var data = {},
                key,
                i,
                value;

            for(key in params) {
                value = params[key];
                
                if(value && typeof value !== 'string') {
                    value = JSON.stringify(value);
                }
                if(value !== undefined) {
                    data[key] = value;
                }
            }

            return QS.stringify(data);
        };

        log = function(d) {
            // todo
            console.log(d);
        };

        has = function(obj, key) {
            return Object.prototype.hasOwnProperty.call(obj, key);
        };

        getAccessToken = function() {
            return options('accessToken');
        };

        setAccessToken = function(accessToken) {
            options({'accessToken': accessToken});
        };

        getAppSecretProof = function(accessToken, appSecret) {
            var hmac = crypto.createHmac('sha256', appSecret);
            hmac.update(accessToken);
            return hmac.digest('hex');
        };

        /**
         *
         * @access public
         * @param signedRequest {String} the signed request value
         * @param appSecret {String} the application secret
         * @return {Object} the parsed signed request or undefined if failed
         *
         * throws error if appSecret is not defined
         *
         * FB.parseSignedRequest('signedRequest', 'appSecret')
         * FB.parseSignedRequest('signedRequest') // will use appSecret from options('appSecret')
         *
         */
        parseSignedRequest = function() {
            var args = Array.prototype.slice.call(arguments),
                signedRequest = args.shift(),
                appSecret = args.shift() || options('appSecret'),
                split,
                encodedSignature,
                encodedEnvelope,
                envelope,
                hmac,
                base64Digest,
                base64UrlDigest;

            if(!signedRequest) {
                debugSig('invalid signedRequest');
                return;
            }

            if(!appSecret) {
                throw new Error('appSecret required');
            }

            split = signedRequest.split('.');

            if(split.length !== 2) {
                debugSig('invalid signedRequest');
                return;
            }

            encodedSignature = split.shift();
            encodedEnvelope = split.shift();

            if(!encodedSignature || !encodedEnvelope) {
                debugSig('invalid signedRequest');
                return;
            }

            try{
                envelope = JSON.parse(base64UrlDecode(encodedEnvelope));
            }
            catch(ex) {
                debugSig('encodedEnvelope is not a valid base64 encoded JSON');
                return;
            }

            if(!(envelope && has(envelope, 'algorithm') && envelope.algorithm.toUpperCase() === 'HMAC-SHA256')) {
                debugSig(envelope.algorithm + ' is not a supported algorithm, must be one of [HMAC-SHA256]');
                return;
            }

            hmac = crypto.createHmac('sha256', appSecret);
            hmac.update(encodedEnvelope);
            base64Digest = hmac.digest('base64');

            // remove Base64 padding
            base64UrlDigest = base64Digest.replace(/={1,3}$/, '');

            // Replace illegal characters
            base64UrlDigest = base64UrlDigest.replace(/\+/g, '-').replace(/\//g, '_');

            if(base64UrlDigest !== encodedSignature) {
                debugSig('invalid signature');
                return;
            }

            return envelope;
        };

        base64UrlDecode = function(str) {
            var base64String = str.replace(/\-/g, '+').replace(/_/g, '/');
            var buffer = new Buffer(base64String, 'base64');
            return buffer.toString('utf8');
        }

        options = function(keyOrOptions) {
            var key;
            if(!keyOrOptions) {
                return opts;
            }
            if(Object.prototype.toString.call(keyOrOptions) == '[object String]') {
                return has(opts, keyOrOptions) ? opts[keyOrOptions] : null;
            }
            for(key in opts) {
                if(has(opts, key) && has(keyOrOptions, key)) {
                    opts[key] = keyOrOptions[key];
                    switch(key){
                        case 'appSecret':
                        case 'accessToken':
                            opts.appSecretProof =
                                (opts.appSecret && opts.accessToken) ?
                                getAppSecretProof(opts.accessToken, opts.appSecret) :
                                null;
                            break;
                    }
                }
            }
        };

        function FacebookApiException(res) {
            this.name = "FacebookApiException";
            this.message = JSON.stringify(res || {});
            this.response = res;
        }

        FacebookApiException.prototype = Object.create(Error.prototype);
        FacebookApiException.prototype.constructor = FacebookApiException;

        nodeifyCallback = function(originalCallback) {
            // normalizes the callback parameters so that the
            // first parameter is always error and second is response
            return function(res) {
                if(!res || res.error) {
                    originalCallback(new FacebookApiException(res));
                }
                else {
                    originalCallback(null, res);
                }
            };
        }

        /**
         *
         * @access public
         * @param path {String} the url path
         * @param method {String} the http method (default: `"GET"`)
         * @param params {Object} the parameters for the query
         * @param cb {Function} the callback function to handle the error and response
         */
        napi = function() {
            //
            // normalizes to node style callback so can use the sdk with async control flow node libraries
            //  first parameters:          error (always type of FacebookApiException)
            //  second callback parameter: response
            //
            // FB.napi('/platform', function(err, response) {
            //  console.log(response.company_overview);
            // });
            //
            // FB.napi('/platform/posts', { limit: 3 }, function(err, response) {
            // });
            //
            // FB.napi('/me/feed', 'post', { message: body }, function(error, response) {
            //  if(error) {
            //      console.log('Error occured');
            //  } else {
            //      console.log('Post ID:' + response.id);
            //  }
            // });
            //
            // var postId = '1234567890';
            // FB.napi(postId, 'delete', function(error, response) {
            //  if(error) {
            //      console.log('Error occurred');
            //  } else {
            //      console.log('Post was deleted');
            //  }
            // });
            //
            //

            var args = Array.prototype.slice.call(arguments);

            if(args.length > 0) {
                var originalCallback = args.pop();
                args.push(typeof(originalCallback) == 'function' ? nodeifyCallback(originalCallback) : originalCallback);
            }

            api.apply(this, args);
        };

        /**
         *
         * @access public
         * @param opt {Object} the parameters for appId and scope
         */
        getLoginUrl = function(opt) {
            opt = opt || {};
            var clientId = opt.appId || opt.client_id || options('appId'),
                redirectUri = opt.redirectUri || opt.redirect_uri || options('redirectUri') || 'https://www.facebook.com/connect/login_success.html',
                scope = opt.scope || options('scope'),
                display = opt.display,
                state = opt.state,
                scopeQuery = '',
                displayQuery = '',
                stateQuery = '',
                loginUrl;

            if(!clientId) {
                throw new Error('client_id required');
            }

            if(scope) {
                scopeQuery = '&scope=' + encodeURIComponent(scope);
            }

            if(display) {
                displayQuery = '&display=' + display
            }

            if(state) {
                stateQuery = '&state=' + state;
            }

            return 'https://www.facebook.com/' + options('version' ) + '/dialog/oauth'
                + '?response_type=' + (opt.responseType || opt.response_type || 'code')
                +  scopeQuery
                +  displayQuery
                +  stateQuery
                + '&redirect_uri=' + encodeURIComponent(redirectUri)
                + '&client_id=' + clientId;
        };

        return {
            api: api,
            napi: napi, // this method does not exist in fb js sdk
            getAccessToken: getAccessToken,
            setAccessToken: setAccessToken, // this method does not exist in fb js sdk
            parseSignedRequest: parseSignedRequest, // this method does not exist in fb js sdk
            getLoginUrl: getLoginUrl, // this method does not exist in fb js sdk
            options: options, // this method does not exist in the fb js sdk
            version: version, // this method does not exist in the fb js sdk
            FacebookApiException: FacebookApiException // this Error does not exist in the fb js sdk
        };

    })();

    module.exports = FB;

})();
