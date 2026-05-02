import argparse
import os

import uvicorn

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Helpline backend")
    parser.add_argument(
        "--no-print-logs",
        dest="print_logs",
        action="store_false",
        default=True,
        help="Disable printing logs to stdout (they still go to the SQLite DB)",
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", default=False)
    args = parser.parse_args()

    os.environ["PRINT_LOGS"] = "1" if args.print_logs else "0"

    uvicorn.run("main:app", host=args.host, port=args.port, reload=args.reload)
