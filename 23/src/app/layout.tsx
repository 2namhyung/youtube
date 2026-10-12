import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '정치 아카이브 스튜디오',
  description: '출처와 장면을 함께 정리하는 영상 제작용 정치 아카이브',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
