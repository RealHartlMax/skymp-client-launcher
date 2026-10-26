#ifdef _WIN32
#include <Windows.h>
#ifndef max
#error The native renderer regression test requires the Windows max macro.
#endif
#endif
#include "CefFrameBuffer.h"
#include <array>
#include <cassert>
#include <thread>
#include <atomic>
#include <iostream>
#ifdef _WIN32
#include <d3d11.h>
#include <wrl/client.h>
#pragma comment(lib, "d3d11.lib")
void checkD3DUpload()
{
  using Microsoft::WRL::ComPtr;
  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11DeviceContext> context;
  assert(SUCCEEDED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, 0,
    nullptr, 0, D3D11_SDK_VERSION, &device, nullptr, &context)));
  CefFrameBuffer frames;
  for (const auto width : { 13u, 31u, 1920u }) {
    const auto height = 3u;
    std::vector<uint8_t> pixels(width * height * 4);
    for (size_t index = 0; index < pixels.size(); ++index) pixels[index] = static_cast<uint8_t>(index % 251);
    assert(frames.Store(pixels.data(), width, height));
    D3D11_TEXTURE2D_DESC description{};
    description.Width = width;
    description.Height = height;
    description.MipLevels = description.ArraySize = 1;
    description.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    description.SampleDesc.Count = 1;
    description.Usage = D3D11_USAGE_DYNAMIC;
    description.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    description.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
    ComPtr<ID3D11Texture2D> texture, staging;
    assert(SUCCEEDED(device->CreateTexture2D(&description, nullptr, &texture)));
    D3D11_MAPPED_SUBRESOURCE mapped{};
    assert(SUCCEEDED(context->Map(texture.Get(), 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped)));
    assert(frames.CopyTo(mapped.pData, mapped.RowPitch, width, height));
    context->Unmap(texture.Get(), 0);
    description.Usage = D3D11_USAGE_STAGING;
    description.BindFlags = 0;
    description.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    assert(SUCCEEDED(device->CreateTexture2D(&description, nullptr, &staging)));
    context->CopyResource(staging.Get(), texture.Get());
    assert(SUCCEEDED(context->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &mapped)));
    for (unsigned row = 0; row < height; ++row) assert(std::memcmp(
      static_cast<uint8_t*>(mapped.pData) + row * mapped.RowPitch,
      pixels.data() + row * width * 4, width * 4) == 0);
    context->Unmap(staging.Get(), 0);
  }
  std::cout << "D3D11 WARP: real texture upload/readback and padded row-pitch checks passed\n";
}
#endif
int main()
{
  CefFrameBuffer frames;
  std::array<uint8_t, 24> source;
  for (size_t i = 0; i < source.size(); ++i) source[i] = static_cast<uint8_t>(i + 1);
  assert(!frames.Store(nullptr, 3, 2));
  assert(!frames.Store(source.data(), 0, 2));
  assert(!frames.Store(source.data(), 9000, 2));
  assert(frames.Store(source.data(), 3, 2));
  assert(!frames.HasFrame(2, 3));
  assert(frames.HasFrame(3, 2));
  std::array<uint8_t, 32> output; output.fill(0xee);
  assert(!frames.CopyTo(output.data(), 8, 3, 2));
  assert(frames.HasFrame(3, 2));
  assert(frames.CopyTo(output.data(), 16, 3, 2));
  for (int row = 0; row < 2; ++row) {
    for (int col = 0; col < 12; ++col) assert(output[row * 16 + col] == source[row * 12 + col]);
    for (int col = 12; col < 16; ++col) assert(output[row * 16 + col] == 0xee);
  }
  assert(!frames.HasFrame(3, 2));
  assert(frames.Store(source.data(), 3, 2));
  assert(frames.Store(source.data(), 2, 3));
  assert(!frames.CopyTo(output.data(), 16, 3, 2));
  assert(frames.HasFrame(2, 3));
  std::atomic<bool> running{true};
  std::thread producer([&] { for(int i=0;i<5000;++i) assert(frames.Store(source.data(), 3, 2)); running=false; });
  while(running) frames.CopyTo(output.data(), 16, 3, 2);
  producer.join();
#ifdef _WIN32
  checkD3DUpload();
#endif
  std::cout << "CEF frame mailbox: dimensions, resize, row pitch, padding, consume and concurrent paint/render checks passed\n";
}
