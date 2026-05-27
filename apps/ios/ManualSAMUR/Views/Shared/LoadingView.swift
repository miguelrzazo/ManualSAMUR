import SwiftUI

struct LoadingView: View {
    @Environment(DataStore.self) private var store

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "cross.case.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.samurBlue)

                Text("SAMUR Manual")
                    .font(.title2.weight(.semibold))

                ProgressView()
                    .tint(Color.samurBlue)

                Text("Descargando contenido…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(32)
            .samurCard()
        }
    }
}
