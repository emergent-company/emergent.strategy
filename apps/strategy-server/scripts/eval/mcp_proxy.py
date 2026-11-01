#!/usr/bin/env python3
"""A plain TCP pipe in front of the dev server: mcp_proxy.py LISTEN_PORT TARGET_PORT

On macOS the server can exit when an MCP client connects and resets the
connection at once ("accept: setsockopt: invalid argument"). Behind this pipe the
server only sees well-behaved local connections. Not needed on Linux, and not for
production. Listens on 127.0.0.1 only."""
import socket
import sys
import threading


def pipe(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        for s in (src, dst):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                s.close()
            except OSError:
                pass


def handle(client, target):
    try:
        upstream = socket.create_connection(target, timeout=10)
    except OSError:
        client.close()
        return
    upstream.settimeout(None)
    threading.Thread(target=pipe, args=(client, upstream), daemon=True).start()
    threading.Thread(target=pipe, args=(upstream, client), daemon=True).start()


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    listen, target = ('127.0.0.1', int(sys.argv[1])), ('127.0.0.1', int(sys.argv[2]))
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(listen)
    s.listen(128)
    while True:
        try:
            c, _ = s.accept()
        except OSError:
            continue
        handle(c, target)


if __name__ == '__main__':
    main()
