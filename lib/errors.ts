export type ErrorType =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limit"
  | "offline";

/**
 * Where the error came from. This decides the wording the caller gets and
 * whether they get any at all — a database failure is logged and answered
 * with something deliberately vague, because its message describes our
 * schema rather than anything the caller did wrong.
 */
export type Surface = "fleet" | "auth" | "api" | "database";

export type ErrorCode = `${ErrorType}:${Surface}`;

export type ErrorVisibility = "response" | "log";

export const visibilityBySurface: Record<Surface, ErrorVisibility> = {
  database: "log",
  fleet: "response",
  auth: "response",
  api: "response",
};

export class GuardianError extends Error {
  type: ErrorType;
  surface: Surface;
  statusCode: number;

  constructor(errorCode: ErrorCode, cause?: string) {
    super();

    const [type, surface] = errorCode.split(":");

    this.type = type as ErrorType;
    this.cause = cause;
    this.surface = surface as Surface;
    this.message = getMessageByErrorCode(errorCode);
    this.statusCode = getStatusCodeByType(this.type);
  }

  toResponse() {
    const code: ErrorCode = `${this.type}:${this.surface}`;
    const visibility = visibilityBySurface[this.surface];

    const { message, cause, statusCode } = this;

    if (visibility === "log") {
      console.error({
        code,
        message,
        cause,
      });

      return Response.json(
        { code: "", message: "Something went wrong. Please try again later." },
        { status: statusCode }
      );
    }

    return Response.json({ code, message, cause }, { status: statusCode });
  }
}

export function getMessageByErrorCode(errorCode: ErrorCode): string {
  if (errorCode.includes("database")) {
    return "An error occurred while executing a database query.";
  }

  switch (errorCode) {
    case "bad_request:api":
      return "The request couldn't be processed. Please check your input and try again.";

    case "unauthorized:auth":
      return "You need to sign in before continuing.";
    case "forbidden:auth":
      return "Your account does not have access to this feature.";

    case "unauthorized:fleet":
      return "You need to sign in to view the fleet.";
    case "forbidden:fleet":
      return "Your account does not have access to this fleet.";
    case "not_found:fleet":
      return "That machine is not in the fleet.";
    case "rate_limit:fleet":
      return "Too many requests. Please wait a moment and try again.";

    default:
      return "Something went wrong. Please try again later.";
  }
}

function getStatusCodeByType(type: ErrorType) {
  switch (type) {
    case "bad_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "rate_limit":
      return 429;
    case "offline":
      return 503;
    default:
      return 500;
  }
}
