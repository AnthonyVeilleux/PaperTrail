window.onload = function (){
    src="https://accounts.google.com/gsi/client"
    src="https://apis.google.com/js/api.js"
      /* exported gapiLoaded */
      /* exported gisLoaded */
      /* exported handleAuthClick */
      /* exported handleSignoutClick */

      // TODO(developer): Set to client ID and API key from the Developer Console
      const CLIENT_ID = "";
      const API_KEY = "";

      // Discovery doc URL for APIs used by the quickstart
      const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/driveactivity/v2/rest';

      // Authorization scopes required by the API; multiple scopes can be
      // included, separated by spaces.
      const SCOPES = 'https://www.googleapis.com/auth/drive.activity.readonly';

    function authenticate() {
    return new Promise((resolve, reject) => {
        tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: "https://www.googleapis.com/auth/drive",
        callback: (tokenResponse) => {
            if (tokenResponse.error) {
            console.error("Error signing in", tokenResponse);
            reject(tokenResponse);
            return;
            }
            gapi.client.setToken(tokenResponse);
            console.log("Sign-in successful");
            resolve();
        },
        });

        // MUST be triggered by user click (your button already does this)
        tokenClient.requestAccessToken();
    });
    }
    function loadClient() {
    return gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
        ],
    }).then(
        function () { console.log("GAPI client loaded for API"); },
        function (err) { console.error("Error loading GAPI client for API", err); }
    );
    }
    // Make sure the client is loaded and sign-in is complete before calling this method.
  async function execute() {
    try {
      const response = await gapi.client.drive.files.list({
        pageSize: 1000,
        fields: "files(id, name, appProperties)"
      });

      const files = response.result.files || [];
      const list = document.getElementById("content");
      list.innerHTML = "";

      files.forEach(file => {
        const li = document.createElement("li");

        let tagsText = "No tags";

        if (file.appProperties) {
          tagsText = Object.entries(file.appProperties)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ");
        }

        li.textContent =
          `Name: ${file.name} | File ID: ${file.id} | PaperTrail: ${tagsText}`;

        list.appendChild(li);
      });

    } catch (err) {
      console.error("Execute error", err);
    }
  }

  async function setTags(fileId, tags) {
    const res = await gapi.client.drive.files.update({
      fileId,
      supportsAllDrives: true,
      resource: {
        appProperties: tags
      }
    });
    console.log("Tags written:", res);
  }

  async function deleteTagFromFile(fileId, tagKey) {
  try {
    const res = await gapi.client.drive.files.update({
      fileId,
      supportsAllDrives: true,
      resource: {
        appProperties: {
          [tagKey]: null
        }
      }
    });

    console.log(`Tag "${tagKey}" deleted`, res);
  } catch (err) {
    console.error("Delete tag error", err);
  }
}

  var signout = document.getElementById('signout_button');
  if (signout != null){
    signout.onclick = function (){
       handleSignoutClick();
    };
  }

  var deleteTag = document.getElementById('delete');
  if (deleteTag != null){
    deleteTag.style.visibility = 'hidden';
    deleteTag.onclick = function(){
      deleteTagFromFile("", "tag").then(execute);
    }
  }

  var content = document.getElementById('context');
  if (content != null){
    content.style.visibility = 'hidden';
    content.onclick = function (){
      setTags("", {tag: "#Note"}).then(execute);
      document.getElementById('delete').style.visibility = 'visible';
    };
  }

  var authorize = document.getElementById('authorize_button');
  if (authorize != null){
    authorize.onclick = function (){
      authorize.innerHTML = "Change User";
      loadClient().then(authenticate);
      document.getElementById('context').style.visibility = 'visible';
    };
  }

  gapi.load("client", function () {
  console.log("GAPI client loaded");
  });
}