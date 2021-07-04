function verifyAuthenticated(req, res, next) {
  try {
    const authToken = req.cookies.authToken;
    const checkPoint1 = authToken.charAt(8);
    const checkPoint2 = authToken.charAt(23);

    if (checkPoint1 == "-" && checkPoint2 == "-") {
      next();
    } else {
      res.redirect("/");
    }
  } catch (err) {
    res.redirect("/");
  }
}

function checkCurrentJobBatch(req, res, next) {
  try {
    const jobBatch = req.cookies.jobBatch;

    if (jobBatch) {
      next();
    } else {
      res.redirect("/");
    }
  } catch (err) {
    res.redirect("/");
  }
}

module.exports = {
  verifyAuthenticated,
  checkCurrentJobBatch,
};
