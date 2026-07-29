import urllib.request
import urllib.parse
ruta = "/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023/Adrian /101802488.pdf"
url = "http://localhost:8888/abrir?ruta=" + urllib.parse.quote(ruta)
response = urllib.request.urlopen(url)
print(response.read().decode('utf-8'))
