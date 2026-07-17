import { redirect } from 'next/navigation';

export default function EditionPage({ params }: { params: { id: string } }) {
  redirect(`/editions/${params.id}/qg`);
}
