import SwiftUI

struct EmptySearchView: View {
    let query: String

    var body: some View {
        ContentUnavailableView.search(text: query)
    }
}
