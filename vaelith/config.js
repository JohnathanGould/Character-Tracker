/* Firebase web config: Project settings > General > Your apps > the web app's config.
   These values are meant to be public; firestore.rules is what stops anyone but the owner
   from writing. ownerUids: the User UIDs (Authentication > Users) allowed to edit; must match firestore.rules.
   editorEmail: that account's email. When set, sign-in asks only for the password, so anyone
   who knows the password can edit. Leave it empty to ask for email and password.
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
  ownerUids: ["ylay0C7drmWrjyewXRhb9rrNCRg1", "X2xaLzZNQgfcg5uaHfzeUsqnZAo1"], /* cormanthyr, johnathangould */
  editorEmail: "cormanthyr@gmail.com",
  characterId: "vaelith"
};
