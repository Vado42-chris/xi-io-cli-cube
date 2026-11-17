import http.server
import sys
import threading
import unittest
from pathlib import Path

ADAPTER=Path(__file__).resolve().parent
KERNEL=ADAPTER/'kernel'
sys.path.insert(0,str(KERNEL));sys.path.insert(0,str(ADAPTER))
import server_profile


class ProbeHandler(http.server.BaseHTTPRequestHandler):
 ok_hits=0

 def log_message(self,format,*args):
  pass

 def do_GET(self):
  if self.path=='/redirect':
   self.send_response(302)
   self.send_header('Location',f'http://127.0.0.1:{self.server.server_port}/ok')
   self.end_headers()
   return
  if self.path=='/ok':
   type(self).ok_hits+=1
   body=b'ok\n'
   self.send_response(200)
   self.send_header('Content-Length',str(len(body)))
   self.end_headers()
   self.wfile.write(body)
   return
  self.send_response(404);self.end_headers()


class ServerProbePolicyTests(unittest.TestCase):
 def setUp(self):
  ProbeHandler.ok_hits=0
  self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),ProbeHandler)
  self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
  self.thread.start()
  self.addCleanup(self.close_server)

 def close_server(self):
  self.server.shutdown();self.server.server_close();self.thread.join(timeout=3)

 def url(self,path):
  return f'http://127.0.0.1:{self.server.server_port}{path}'

 def test_direct_loopback_health_response_passes(self):
  result=server_profile._probe(self.url('/ok'))
  self.assertEqual(result,{'state':'PASS','status':200})
  self.assertEqual(ProbeHandler.ok_hits,1)

 def test_loopback_redirect_is_refused_without_following_target(self):
  result=server_profile._probe(self.url('/redirect'))
  self.assertEqual(result,{'state':'PROBE_REDIRECT_FORBIDDEN','status':302})
  self.assertEqual(ProbeHandler.ok_hits,0)

 def test_non_loopback_probe_is_refused_before_network_access(self):
  result=server_profile._probe('https://example.com/health')
  self.assertEqual(result,{'state':'PROBE_NOT_LOOPBACK'})


if __name__=='__main__':unittest.main()
