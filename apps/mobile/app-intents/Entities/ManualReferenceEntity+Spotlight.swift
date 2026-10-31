import AppIntents
@preconcurrency import CoreSpotlight
internal import ExpoAppIntents
import UniformTypeIdentifiers

extension ManualReferenceEntity: AppIntentEntityRecordConvertible {}

@available(iOS 18.0, *)
@available(tvOS, unavailable)
extension ManualReferenceEntity: IndexedEntity {
  var attributeSet: CSSearchableItemAttributeSet {
    let attributes = CSSearchableItemAttributeSet(contentType: .text)
    attributes.title = name
    attributes.displayName = name
    attributes.contentDescription = subtitle
    attributes.keywords = synonyms
    return attributes
  }
}
