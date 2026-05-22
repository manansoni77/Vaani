"""
Builds the sonora gRPC-Web ASGI sub-application.

Usage in main.py:
    from grpc_server import make_grpc_asgi_app
    app.mount("/grpc", make_grpc_asgi_app())

Browser clients POST to:
    /grpc/vaani.CallService/StreamCall
    /grpc/vaani.AgentService/StreamAgentAudio

Handler registration uses grpc.GenericRpcHandler subclasses directly instead of
the generated add_XXXServicer_to_server helpers. grpcio 1.80 changed the internal
handler API (grpc.method_handlers_generic_handler) in a way that breaks sonora's
_get_rpc_handler lookup. The stable public API — GenericRpcHandler.service() +
grpc.stream_stream_rpc_method_handler — is what sonora was designed to call.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "proto"))

import grpc
import vaani_pb2
from grpc_servicer import AgentServiceServicer, CallServiceServicer
from sonora.asgi import grpcASGI


class _CallServiceHandler(grpc.GenericRpcHandler):
    def __init__(self, servicer: CallServiceServicer) -> None:
        self._servicer = servicer

    def service(self, handler_call_details):
        if handler_call_details.method == "/grpc/vaani.CallService/StreamCall":
            return grpc.stream_stream_rpc_method_handler(
                self._servicer.StreamCall,
                request_deserializer=vaani_pb2.CallClientMessage.FromString,
                response_serializer=vaani_pb2.CallServerMessage.SerializeToString,
            )
        return None


class _AgentServiceHandler(grpc.GenericRpcHandler):
    def __init__(self, servicer: AgentServiceServicer) -> None:
        self._servicer = servicer

    def service(self, handler_call_details):
        if handler_call_details.method == "/grpc/vaani.AgentService/StreamAgentAudio":
            return grpc.stream_stream_rpc_method_handler(
                self._servicer.StreamAgentAudio,
                request_deserializer=vaani_pb2.AgentClientMessage.FromString,
                response_serializer=vaani_pb2.AgentServerMessage.SerializeToString,
            )
        return None


def make_grpc_asgi_app() -> grpcASGI:
    app = grpcASGI()
    app.add_generic_rpc_handlers([
        _CallServiceHandler(CallServiceServicer()),
        _AgentServiceHandler(AgentServiceServicer()),
    ])
    return app
