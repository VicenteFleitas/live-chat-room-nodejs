import { createServer } from "node:http";
import serveStatic from "serve-static";
import { Router } from "./router.mjs";
import { json as readJSON } from "node:stream/consumers";

const router = new Router();
const defaultHeaders = { "Content-Type": "text/plain" };
const talkPath = /^\/talks\/([^\/]+)$/;

router.add("GET", talkPath, async (server, title) => {
  if (Object.hasOwn(server.talks, title)) {
    return {
      body: JSON.stringify(server.talks[title]),
      headers: { "Content-Type": "application/json" },
    };
  } else {
    return { status: 404, body: `No talk '${title}' found` };
  }
});

router.add("DELETE", talkPath, async (server, title) => {
  if (Object.hasOwn(server.talks, title)) {
    delete server.talks[title];
    server.updated();
  }
  return { status: 204 };
});

router.add("PUT", talkPath, async (server, title, request) => {
  let talk = await readJSON(request);
  if (
    !talk ||
    typeof talk.presenter != "string" ||
    typeof talk.summary != "string"
  ) {
    return { status: 400, body: "Bad talk data" };
  }
  server.talks[title] = {
    title,
    presenter: talk.presenter,
    summary: talk.summary,
    comments: [],
  };
  server.updated();
  return { status: 204 };
});

router.add(
  "POST",
  /^\/talks\/([^\/]+)\/comments$/,
  async (server, title, request) => {
    let comment = await readJSON(request);
    if (
      !comment ||
      typeof comment.author != "string" ||
      typeof comment.message != "string"
    ) {
      return { status: 400, body: "Bad comment data" };
    } else if (Object.hasOwn(server.talks, title)) {
      server.talks[title].comments.push(comment);
      server.updated();
      return { status: 204 };
    } else {
      return { status: 404, body: `No talk '${title}' found` };
    }
  }
);

async function serveFromRouter(server, request, response, next) {
  let resolved = await router.resolve(request, server).catch((error) => {
    if (error.status != null) return error;
    return { body: String(err), status: 500 };
  });
  if (!resolved) return next();
  let { body, status = 200, headers = defaultHeaders } = await resolved;
  response.writeHead(status, headers);
  response.end(body);
}

function notFound(request, response) {
  response.writeHead(404, "Not found");
  response.end("<h1>Not found</h1>");
}

class SkillShareServer {
  constructor(talks) {
    this.talks = talks;
    this.version = 0;
    this.waiting = [];
    let fileServer = serveStatic("./public");
    this.server = createServer((request, response) => {
      serveFromRouter(this, request, response, () => {
        fileServer(request, response, () => notFound(request, response));
      });
    });
  }
  start(port) {
    this.server.listen(port);
  }
  stop() {
    this.server.close();
  }
}
