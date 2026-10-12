/* Firebase web config: Project settings > General > Your apps > the web app's config.
   These values are meant to be public; firestore.rules is what stops anyone but the owner
   from writing. ownerUid is the player's User UID from Authentication > Users.
   Leave apiKey empty to run the tracker offline in one browser only. */
window.TRACKER_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCLapSOUn_x66UJVkwqp0rH5dXx1825dnk",
    authDomain: "tracker-fe359.firebaseapp.com",
    projectId: "tracker-fe359",
    storageBucket: "tracker-fe359.firebasestorage.app",
    messagingSenderId: "382927212734",
    appId: "1:382927212734:web:d62c5c2bef1c1050d58eef"
  },
  ownerUid: "bNp41HfYmMU2efGKCYmKGATCnE93",
  characterId: "daerlieth"
};
