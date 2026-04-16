export default function TenantNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mb-4 text-4xl">🔍</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Link not found
        </h1>
        <p className="text-gray-600 mb-6">
          This tenant portal link is invalid or has expired. If you think this
          is a mistake, please contact us.
        </p>
        <a
          href="mailto:parking@mail.torrinha149.com"
          className="text-blue-600 hover:underline text-sm"
        >
          parking@mail.torrinha149.com
        </a>
      </div>
    </div>
  );
}
