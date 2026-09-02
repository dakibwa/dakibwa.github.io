const redirectWorker = {
  fetch(request) {
    const destination = new URL(request.url);
    destination.protocol = "https:";
    destination.hostname = "portuguesewithines.com";
    destination.port = "";

    return Response.redirect(destination.toString(), 301);
  }
};

export default redirectWorker;
